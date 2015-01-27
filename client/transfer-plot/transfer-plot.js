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

    // map from pattern ID -> pattern name
    this.patternNames = new Map();

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
          instance.patternNames.set(pattern.id, pattern.desc);
        }
      });
    });

    // TODO: group patterns

    debug('found ' + this.patterns.size + ' reachable patterns');

    this.populatePatternSelector();
  },

  /** Allow the user to choose the pattern they want to look at transfers to */
  populatePatternSelector: function() {
    // even though we didn't explicitly call getPatterns on this.model, it is included in this.stops
    // by reference to the same object in memory, so will have received patterns
    _.each(this.model.get('patterns'), function(patt) {
      var opt = document.createElement('option');
      opt.value = _.escape(patt.id);
      opt.innerHTML = _.escape(patt.desc);
      this.$('#fromPattern').append(opt);
    });

    this.patternNames.forEach(function(desc, id) {
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

      data.push({timeOfDay: arrival, transferTime: xfer});
      // accumulate an average
      avg += xfer;

      if (xfer > max) max = xfer;

      return true;
    }, this);

    debug('found ' + data.length + ' transfers, mean ' + avg / data.length + ' seconds');

    data = crossfilter(data);

    // draw the plots
    var xferTime = data.dimension(function (d) {return d.transferTime});


    var binSize = 2; // minutes
    var binnedTime = xferTime.group(function (xferTime) {
      // convert to seconds, bin to two minutes, and convert back to minutes
      return Math.floor(xferTime / (60 * binSize)) * binSize;
    })
    .reduceCount();

    var xferTimeHist = dc.barChart('#xfer-histogram')
      .width(800)
      .height(400)
      .margins({top: 10, right: 20, bottom: 20, left: 40})
      .dimension(xferTime)
      .group(binnedTime, 'transfers')
      .x(d3.scale.linear().domain([0, Math.floor(max / 60)]))
      .xUnits(function() { return max / (binSize * 60); })

      dc.renderAll();
  }
});
