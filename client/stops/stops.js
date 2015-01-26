var Backbone = require('backbone');
var Stop = require('stop');
var config = require('config');

module.exports = Backbone.Collection.extend({
  model: Stop,
  url: config.otpServer + '/routers/' + config.routerId + '/index/stops'
});
