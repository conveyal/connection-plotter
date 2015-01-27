var Backbone = require('backbone');
var _ = require('underscore');
var debug = require('debug')('transfer-plot');
var Stop = require('stop');
var Stops = require('stops');

module.exports = Backbone.View.extend({
  template: _.template(require('./transfer-plot.html')),

  render: function () {
    var instance = this;

    debug('retreving transfers for stop ' + this.model.id);

    this.model.getTransfers().then(function () {
      debug('got ' + instance.model.get('transfers').length + ' transfers');
      instance.getTransferStops();
    });

    this.el.innerHTML = this.template(this.model.toJSON());
  },

  /** Called once transfers have loaded to get the transfer stops */
  getTransferStops: function () {
    var instance = this;

    var promises = [];

    // prepopulate potential transfer stops with this stop
    this.stops = new Stops([this.model], {routerId: this.model.get('routerId')});

    debug('requesting ' + this.model.get('transfers').length + ' transfer stops');

    _.each(_.pluck(this.model.get('transfers'), 'toStopId'), function (stopId) {
      debug('requesting stop ' + stopId + ' on router ' + instance.model.get('routerId'));
      var stop = new Stop({routerId: instance.model.get('routerId'), id: stopId});
      promises.push(stop.fetch().done(function () {
        instance.stops.add(stop);
      }));
    });

    Promise.all(promises).then(function () {
      debug('got ' + instance.stops.models.length + ' possible transfer stops');
      instance.getPatterns();
    });
  },

  /** fetch the patterns */
  getPatterns: function () {
    var instance = this;
    var promises = [];

    debug('requesting patterns for ' + this.stops.length + ' stops');

    this.stops.each(function (stop) {
      promises.push(stop.getPatterns());
    });

    Promise.all(promises).then(function () {
      debug('got patterns');
      instance.processPatterns();
    });
  },

  /** Find the optimal transfer to each pattern */
  processPatterns: function () {
    var instance = this;

    // map from pattern ID -> [closest stop, distance]
    this.patterns = new Map();

    // map from pattern ID -> pattern name
    this.patternNames = new Map();

    this.stops.each(function (stop) {
      // get the relevant transfer
      var distance;

      // 0 distance to self
      if (stop.id == instance.model.id)
        distance = 0;
      else
        distance = _.findWhere(instance.model.get('transfers'), {toStopId: stop.id});

      _.each(stop.get('patterns'), function (pattern) {
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
  populatePatternSelector: function () {
    // even though we didn't explicitly call getPatterns on this.model, it is included in this.stops
    // by reference to the same object in memory, so will have received patterns
    _.each(this.model.get('patterns'), function (patt) {
      var opt = document.createElement('option');
      opt.value = _.escape(patt.id);
      opt.innerHTML = _.escape(patt.desc);
      this.$('#fromPattern').append(opt);
    });

    this.patternNames.forEach(function (desc, id) {
      var opt = document.createElement('option');
      opt.value = _.escape(id);
      opt.innerHTML = _.escape(desc);
      this.$('#toPattern').append(opt);
    }, this);
  }
});
