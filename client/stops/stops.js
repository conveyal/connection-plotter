var Backbone = require('backbone');
var Stop = require('stop');
var config = require('config');

module.exports = Backbone.Collection.extend({
  model: Stop,
  initialize: function (opts) {
    this.url = config.otpServer + '/routers/' + opts.routerId + '/index/stops';
  }
});
