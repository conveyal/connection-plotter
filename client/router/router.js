var Backbone = require('backbone');
var MapView = require('map');

module.exports = Backbone.Router.extend({
  initialize: function (options) {
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
    // put the element in the DOM before rendering, so that leaflet is happy
    var content = document.getElementById('content');
    this.empty(content);
    content.appendChild(m.el);
    m.render();
  },

  /** remove all children of a dom node */
  empty: function (domNode) {
    // http://stackoverflow.com/questions/3955229
    while (domNode.firstChild) {
      domNode.removeChild(domNode.firstChild);
    }
  }
})
