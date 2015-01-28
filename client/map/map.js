var config = require('config');
var debug = require('debug')('map');
var Backbone = require('backbone');
var $ = require('jquery');
var Stops = require('stops');
var Disambiguator = require('disambiguator');

// persist the map center across renders
var center = null;
var zoom;

/**
 * Backbone view representing the map of stops.
 */
module.exports = Backbone.View.extend({
  initialize: function(opts) {
    this.routerId = opts.routerId;
  },

  render: function() {
    var instance = this;

    this.stops = new Stops([], {routerId: this.routerId});

    this.$el.css('width', config.mapWidth).css('height', config.mapHeight).attr('id', 'map');

    this.map = new L.Map(this.el, {
      center: [37.363, -122.123],
      zoom: 12
    });

    // add conveyal tiles
    L.tileLayer("http://{s}.tiles.mapbox.com/v3/conveyal.hml987j0/{z}/{x}/{y}.png", {
      attribution: "Map data &copy; OpenStreetMap contributors, CC-BY-SA, Imagery &copy; Mapbox",
      maxZoom: 18
    }).addTo(this.map);

    // render stops on change
    this.map.on('viewreset', function() {
      center = instance.map.getCenter();
      zoom = instance.map.getZoom();

      var b = instance.map.getBounds();

      debug('retrieving stops');

      instance.stops.reset();
      instance.stops.fetch({
          routerId: instance.routerId,
          data: {
            minLat: b.getSouth(),
            minLon: b.getWest(),
            maxLat: b.getNorth(),
            maxLon: b.getEast()
          }
        })
        .done(function() {
          debug('got ' + instance.stops.models.length + ' stops');

          // clear out old stops
          if (instance.stopLayer)
            instance.map.removeLayer(instance.stopLayer);

          instance.stopLayer = L.featureGroup();

          instance.stops.each(function(stop) {
            var stopMarker = new L.CircleMarker(new L.LatLng(stop.get('lat'), stop.get('lon')), {
              radius: 5
            });
            stopMarker.bindLabel(stop.get("name"));
            instance.stopLayer.addLayer(stopMarker);
          });

          instance.stopLayer.addTo(instance.map);
        });
    });

    // set the click handler
    this.map.on('click', function(evt) {
      var d = new Disambiguator({
        lat: evt.latlng.lat,
        lon: evt.latlng.lng,
        routerId: instance.routerId
      }).render();

      var popup = L.popup({minWidth: 300, minHeight: 400})
        .setLatLng(evt.latlng)
        .setContent(d.el)
        .openOn(instance.map);
    });

    // zoom to graph extent, more or less
    if (center === null) {
      $.get(config.otpServer + '/routers/' + this.routerId).then(function(data) {
        debug('got graph summary for router' + data.routerId);

        var c = [];

        for (var i = 0; i < data.polygon.coordinates[0].length; i++) {
          c.push([data.polygon.coordinates[0][i][0], data.polygon.coordinates[0][i][1]]);
        }

        var poly = turf.polygon([c]);
        var center = turf.centroid(poly).geometry.coordinates;
        debug('graph center: ' + center[1] + ', ' + center[0]);

        instance.map.setView(new L.LatLng(center[1], center[0]), 11);
      });
    } else {
      // use persisted center and zoom
      this.map.setView(center, zoom);
    }
  }
});
