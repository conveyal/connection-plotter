var Backbone = require('backbone');
var MapView = require('map');
var TransferPlot = require('transfer-plot');
var Stop = require('stop');
var $ = require('jquery');

module.exports = Backbone.Router.extend({
  initialize: function () {
    Backbone.history.start();
  },

  routes: {
    "": "defaultMap",
    ":routerId": "map",
    "stop/:stopId": "defaultStop",
    ":routerId/stop/:stopId": "stop"
  },

  /** render the map for the default router ID */
  defaultMap: function () {
    this.map('default');
  },

  map: function (routerId) {
    var m = new MapView({routerId: routerId});
    // bind directly to top-level div
    this.empty();
    var map = document.getElementById('map');
    m.el = map;
    m.$el = $(map);
    m.render();
  },

  stop: function (routerId, stopId) {
    var instance = this;

    var stop = new Stop({routerId: routerId, id: stopId});
    stop.fetch().done(function () {
      var p = new TransferPlot({model: stop});
      var content = document.getElementById('content');
      instance.empty();
      content.appendChild(p.el);
      p.render();
    });
  },

  /** remove all children of a dom node */
  empty: function () {
    // http://stackoverflow.com/questions/3955229

    var domNode = document.getElementById('content');
    while (domNode.firstChild) {
      domNode.removeChild(domNode.firstChild);
    }

    // make an entirely new map div to clear leaflet state
    var oldMap = document.getElementById('map');
    oldMap.setAttribute('id', '');
    var newMap = document.createElement('div');
    newMap.setAttribute('id', 'map');
    oldMap.parentNode.insertBefore(newMap, oldMap);
    oldMap.parentNode.removeChild(oldMap);    
  }
});
