var Backbone = require('backbone');
var config = require('config');

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
  urlRoot: config.otpServer + '/routers/' + config.routerId + '/index/stops'
});
