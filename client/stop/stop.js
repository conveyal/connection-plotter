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
  urlRoot: config.otpServer + '/routers/' + config.routerId + '/index/stops',

  /**
   * Get the patterns for this stop, and return a promise for when they will be done.
   */
  getPatterns: function () {
    var instance = this;
    var ret = new Promise();

    $.get(this.urlRoot + '/' + this.get('id') + '/patterns').done(function (data) {
      instance.set('patterns', data);
      ret.resolve(data);
    });

    return ret;
  }
});
