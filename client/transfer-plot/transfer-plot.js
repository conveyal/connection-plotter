var Backbone = require('backbone');
var _ = require('underscore');
var debug = require('debug')('transfer-plot');
var Stop = require('stop');
var Stops = require('stops');
var config = require('config');
var $ = require('jquery');

module.exports = Backbone.View.extend({
  template: _.template(require('./transfer-plot.html')),

  events: {
    'change .pattern': 'changePattern'
  },

  initialize: function() {
    _.bindAll(this, 'changePattern');
  },

  render: function() {
    var instance = this;

    debug('retreving transfers for stop ' + this.model.id);

    this.model.getTransfers().then(function() {
      debug('got ' + instance.model.get('transfers').length + ' transfers');
      instance.getTransferStops();
    });

    this.el.innerHTML = this.template(this.model.toJSON());
  },

  /** Called once transfers have loaded to get the transfer stops */
  getTransferStops: function() {
    var instance = this;

    var promises = [];

    // prepopulate potential transfer stops with this stop
    this.stops = new Stops([this.model], {
      routerId: this.model.get('routerId')
    });

    debug('requesting ' + this.model.get('transfers').length + ' transfer stops');

    _.each(_.pluck(this.model.get('transfers'), 'toStopId'), function(stopId) {
      debug('requesting stop ' + stopId + ' on router ' + instance.model.get('routerId'));
      var stop = new Stop({
        routerId: instance.model.get('routerId'),
        id: stopId
      });
      promises.push(stop.fetch().done(function() {
        instance.stops.add(stop);
      }));
    });

    Promise.all(promises).then(function() {
      debug('got ' + instance.stops.models.length + ' possible transfer stops');
      instance.getPatterns();
    });
  },

  /** fetch the patterns */
  getPatterns: function() {
    var instance = this;
    var promises = [];

    debug('requesting patterns for ' + this.stops.length + ' stops');

    this.stops.each(function(stop) {
      promises.push(stop.getPatterns());
    });

    Promise.all(promises).then(function() {
      debug('got patterns');
      instance.processPatterns();
    });
  },

  /** Find the optimal transfer to each pattern */
  processPatterns: function() {
    var instance = this;

    // map from pattern ID -> [closest stop, distance]
    this.patterns = new Map();

    this.stops.each(function(stop) {
      // get the relevant transfer
      var distance;

      // 0 distance to self
      if (stop.id == instance.model.id)
        distance = 0;
      else
        distance = _.findWhere(instance.model.get('transfers'), {
          toStopId: stop.id
        }).distance;

      _.each(stop.get('patterns'), function(pattern) {
        if (!instance.patterns.has(pattern.id) || distance < instance.patterns.get(pattern.id)[1]) {
          instance.patterns.set(pattern.id, [stop.id, distance]);
        }
      });
    });

    // TODO: group patterns

    debug('found ' + this.patterns.size + ' reachable patterns');

    this.groupPatterns();
  },

  /** group the patterns by next stop */
  groupPatterns: function () {
    debug('grouping ' + this.patterns.size + ' patterns');

    var instance = this;
    var promises = [];

    // map from group ID to [pattern_id]
    this.patternGroups = new Map();

    // map from pattern ID to group ID
    this.patternMembership = new Map();

    // map from pattern ID to [route_name, last stop name]
    this.patternLastStops = new Map();

    // map from pattern to [trip_id]
    this.patternTrips = new Map();

    this.patterns.forEach(function(val, patternId) {
      // get the pattern stops
      promises.push(Promise.resolve(
        $.get(config.otpServer + '/routers/' + instance.model.get('routerId') + '/index/patterns/' + patternId)
        .done(function (patt) {
          // find the next stop
          var thisStop = 0;

          var thisStopId = instance.patterns.get(patt.id)[0]  ;

          // TODO: loop routes?
          while (patt.stops[thisStop].id != thisStopId)
            thisStop++;

          var nextStop;
          // there is no next stop, end of the line
          if (thisStop == patt.stops.length - 1)
            nextStop = null;
          else
            nextStop = patt.stops[thisStop + 1].id;

          var group = nextStop + '_' + patt.routeId;
          if (!instance.patternGroups.has(group))
            instance.patternGroups.set(group, [patternId]);
          else
            instance.patternGroups.get(group).push(patternId);

          instance.patternMembership.set(patternId, group);

          // save naming information
          instance.patternLastStops.set(patternId, {route: patt.routeId, stop: patt.stops[patt.stops.length - 1].name});
        })
      ));
    });

    Promise.all(promises).then(function () {
      debug('grouped ' + instance.patterns.size + ' patterns into ' + instance.patternGroups.size + ' groups');
      instance.inferPatternGroupNames();
      instance.populatePatternSelector();
    });
  },

  /** Create names for each group of patterns */
  inferPatternGroupNames: function () {
    debug('naming ' + this.patternGroups.size + ' patterns');

    // map from pattern group ID -> pattern group name
    this.patternGroupNames = new Map();
    this.patternGroups.forEach(function (patternIds, group) {
      var id = this.patternLastStops.get(patternIds[0]).route + ' to ';

      var lastStops = [];

      patternIds.forEach(function (patternId) {
        var stopName = this.patternLastStops.get(patternId).stop;
        if (lastStops.indexOf(stopName) == -1)
          lastStops.push(stopName);
      }, this);

      id += lastStops.join(' / ');

      this.patternGroupNames.set(group, id);
    }, this);
  },

  /** Allow the user to choose the pattern they want to look at transfers to */
  populatePatternSelector: function() {
    // even though we didn't explicitly call getPatterns on this.model, it is included in this.stops
    // by reference to the same object in memory, so will have received patterns
    var fromGroupsIncludedSoFar = new Set();
    var instance = this;

    _.each(this.model.get('patterns'), function(patt) {
      // add each pattern group only once
      var groupId = instance.patternMembership.get(patt.id);
      if (fromGroupsIncludedSoFar.has(groupId))
        return;

      var opt = document.createElement('option');
      opt.value = _.escape(groupId);
      opt.innerHTML = _.escape(instance.patternGroupNames.get(groupId));
      fromGroupsIncludedSoFar.add(groupId);
      this.$('#fromPattern').append(opt);
    });

    this.patternGroupNames.forEach(function(desc, id) {
      var opt = document.createElement('option');
      opt.value = _.escape(id);
      opt.innerHTML = _.escape(desc);
      this.$('#toPattern').append(opt);
    }, this);

    // trigger change event manually
    this.changePattern();
  },

  /** handle changing the pattern: pull down data on transfer times and make the histograms */
  changePattern: function(e) {
    var instance = this;

    this.fromPattern = this.$('#fromPattern').val();
    this.toPattern = this.$('#toPattern').val();

    // figure out the stop for the toPattern
    this.toStop = this.patterns.get(this.toPattern)[0];
    this.transferDistance = this.patterns.get(this.toPattern)[1];
    this.minTransferTime = this.transferDistance / config.walkingSpeed + config.minTransferTime;

    debug('transferring from pattern ' + this.fromPattern + ' to pattern ' + this.toPattern +
      ', walking ' + this.transferDistance + 'm in ' + this.minTransferTime + 's');

    // TODO: show stops on a miniature map

    // get the trips on this pattern
    // TODO: only get trips that are actually running on a single day
    var from = this.getTripTimes(this.model.id, this.fromPattern, "from");
    var to = this.getTripTimes(this.toStop, this.toPattern, "to");

    Promise.all([from, to]).then(function() {
      debug('got ' + instance.arrivals.length + ' arrivals and ' + instance.departures.length + ' departures');
      instance.calculateWaitTimes();
    });
  },

  /** get the times of a pattern at a stop */
  getTripTimes: function(stop, pattern, which) {
    var instance = this;

    debug('getting trips at stop ' + stop + ' on pattern ' + pattern);

    if (which == "from")
      this.arrivals = [];
    else if (which == "to")
      this.departures = [];
    else return Promise.reject("which must be from or to");

    // first get the trip IDs
    return new Promise(function(resolve, reject) {
      $.get(config.otpServer + '/routers/' + instance.model.get('routerId') + '/index/patterns/' + pattern + '/trips')
        .done(function(data) {
          var tripIds = _.pluck(data, 'id');

          debug('retrieving stop times for ' + tripIds.length + ' trips');

          var promises = [];

          _.each(tripIds, function(tripId) {
            promises.push(Promise.resolve(
              $.get(config.otpServer + '/routers/' + instance.model.get('routerId') +
                '/index/trips/' + tripId + '/stoptimes')
              .done(function(stopTimes) {
                // TODO: loop routes?
                var st = _.findWhere(stopTimes, {
                  stopId: stop
                });

                if (which == "from")
                  instance.arrivals.push(st.scheduledArrival);
                else
                  instance.departures.push(st.scheduledDeparture);
              })));
          });

          Promise.all(promises).then(function () {
            debug('got ' + promises.length + ' stop times');
            resolve(which == "from" ? instance.arrivals : instance.departures);
          });
        });
    });
  },

  /** calculate the wait times for all possible transfers */
  calculateWaitTimes: function () {
    // sort the arrivals and departures so we can scan through them sequentially
    this.arrivals.sort();
    this.departures.sort();

    var departureIdx = 0;

    var data = [];

    var avg = 0;
    var max = 0;

    this.arrivals.every(function (arrival) {
      while (this.departures[departureIdx] < arrival + this.minTransferTime) {
        departureIdx++;
        if (departureIdx >= this.departures.length) {
          // stop iteration
          return false;
        }
      }

      var xfer = this.departures[departureIdx] - arrival;

      if (xfer > config.maxTransferTime)
        // ce n'est un transfer
        // nobody would ever make this transfer, effectively one of the routes is not running
        // but there may be reasonable transfers later on, so continue the loop
        return true;

      // express arrival in hours, transfer time in minutes
      data.push({timeOfDay: arrival / 3600, transferTime: xfer / 60});
      // accumulate an average
      avg += xfer;

      if (xfer > max) max = xfer;

      return true;
    }, this);

    debug('found ' + data.length + ' transfers, mean ' + avg / data.length + ' seconds');

    data = crossfilter(data);

    // draw the plots
    // first, the transfer time histogram
    var xferTime = data.dimension(function (d) {return d.transferTime});

    var binSize = 1; // minutes
    var binnedTime = xferTime.group(function (xferTime) {
      // bin to two minutes
      return Math.floor(xferTime / binSize) * binSize;
    })
    .reduceCount();

    var xferTimeHist = dc.barChart('#xfer-histogram', 'transfer')
      .width(800)
      .height(400)
      .margins({top: 10, right: 20, bottom: 20, left: 40})
      .dimension(xferTime)
      .group(binnedTime, 'transfers')
      .x(d3.scale.linear().domain([0, Math.floor(max / 60)]))
      .xUnits(function() { return max / (binSize * 60); })
      .elasticY(true);

    // now the time of day histogram
    var timeOfDay = data.dimension(function (d) { return d.timeOfDay });
    var todBinSize = 0.5; // hours

    window.binnedTod = timeOfDay.group(function (time) {
      return Math.floor(time / todBinSize) * todBinSize;
    })
    .reduceCount();

    window.todHist = dc.barChart('#time-of-day-histogram', 'transfer')
      .width(800)
      .height(400)
      .margins({top: 10, right: 20, bottom: 20, left: 40})
      .dimension(timeOfDay)
      .x(d3.scale.linear().domain([0, 24]))
      .xUnits(function () { return 24 / todBinSize; })
      .group(binnedTod, "time of day")
      .elasticY(true);

      dc.renderAll('transfer');
  }
});
