var Backbone = require('backbone');
var Stop = require('stop');
var config = require('config');
var _ = require('underscore');

module.exports = Backbone.Collection.extend({
  model: Stop,
  initialize: function (models, opts) {
    this.url = config.otpServer + '/routers/' + opts.routerId + '/index/stops';
  },
});
