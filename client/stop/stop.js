var Backbone = require('backbone');
var config = require('config');
var $ = require('jquery');

module.exports = Backbone.Model.extend({
  defaults: {
    id: null,
    name: null,
    lat: null,
    lon: null,
    code: null,
    desc: null,
    zoneId: null,
    url: null,
    locationType: null,
    wheelchairBoarding: null,
    vehicleType: null,
    vehicleTypeSet: null
  },

  initialize: function(attrs, opts) {
    this.routerId = opts.routerId;
    this.refreshUrlRoot();
  },

  refreshUrlRoot: function () {
    this.urlRoot = config.otpServer + '/routers/' + this.routerId + '/index/stops';
  },

  /**
   * Get the patterns for this stop, and return a promise for when they will be done.
   */
  getPatterns: function() {
    var instance = this;
    return Promise.resolve(
      $.get(this.urlRoot + '/' + this.get('id') + '/patterns').done(function(data) {
        instance.set('patterns', data);
      })
    );
  },

  /** get the transfers for this stop */
  getTransfers: function() {
    var instance = this;
    return Promise.resolve(
      $.get(instance.urlRoot + '/' + instance.get('id') + '/transfers').done(function(data) {
        instance.set('transfers', data);
      })
    );
  },

  /** get the routes for this stop */
  getRoutes: function() {
    var instance = this;
    return Promise.resolve(
      $.get(instance.urlRoot + '/' + instance.get('id') + '/routes').done(function(data) {
        instance.set('routes', data);
      })
    );
  }
});
