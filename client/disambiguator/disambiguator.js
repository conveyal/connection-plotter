var Backbone = require('backbone');
var _ = require('underscore');
var Stops = require('stops');
var debug = require('debug')('disambiguator');

module.exports = Backbone.View.extend({
  template: _.template(require('./disambiguator.html')),

  initialize: function(opts) {
    this.lat = opts.lat;
    this.lon = opts.lon;
    this.routerId = opts.routerId;
  },

  render: function() {
    var instance = this;

    // grab the nearby stops
    this.stops = new Stops([], {routerId: this.routerId});
    this.stops.fetch({
        routerId: this.routerId,
        data: {
          lat: this.lat,
          lon: this.lon,
          radius: 250
        }
      })
      .done(function() {
        debug('got ' + instance.stops.length + ' stops');
        instance.getRoutes();
      });

      return this;
  },

  /** get the routes for every stop */
  getRoutes: function() {
    var instance = this;
    var promises = [];

    this.stops.forEach(function(stop) {
      promises.push(stop.getRoutes());
    });

    Promise.all(promises).then(function() {
      debug('retrieved routes for stops');
      instance.showList();
    });
  },

  showList: function() {
    debug('showing list');
    this.el.innerHTML = this.template({
      stops: this.stops.toJSON(),
      routerId: this.routerId
    });
  }
});
