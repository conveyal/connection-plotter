var debug = require('debug')('grouper');

/**
 * Call with a list of patterns from the same route. Will return two lists which represent a partition of those
 * patterns into best-guess directions.
 */
 module.exports = function (patterns) {
   // the bearings from start to end of each pattern.
   var patternBearings = [];
   var patternBearingSet = new Set();

   patterns.forEach(function (pattern) {
     var firstStop = pattern.stops[0];
     var lastStop = pattern.stops[pattern.stops.length - 1];

     var firstPt = turf.point([firstStop.lat, firstStop.lon]);
     var secondPt = turf.point([lastStop.lat, lastStop.lon]);

     var bearing = Math.floor(turf.bearing(firstPt, secondPt));
     patternBearings.push(bearing);
     patternBearingSet.add(bearing);
   }, this);

   debug('found bearings for patterns: ' + patternBearings.join(', '));

   // now cluster by bearing into two clusters by finding the largest gap
   // these are circular so we have to be a little careful
   // we sweep around in 1-degree increments, keeping track of where the largest sweep is
   // then we take the middle of that and use it to divide the directions
   // this is basically a circular maximal margin classifier, with no labels
   var currentSweepStart = null;
   var currentSweepEnd = null;
   var bestSweepStart = null;
   var bestSweepEnd = null;
   var bestSweepLen = 0;

   // we check the entire circle so that if the best margin is provided by a line at 0 degrees,
   // it will still be detected (at 180 degrees)
   for (var i = 0; i < 360; i++) {
     // check if there are routes in this bin
     if (patternBearingSet.has(i) || patternBearingSet.has((i + 180) % 360)) {
       // end of a sweep, if it existed
       if (currentSweepStart !== null) {
         currentSweepEnd = i - 1;
         // + 1: fencepost problem. include both start and end.
         var sweepLen = currentSweepEnd - currentSweepStart + 1;
         if (sweepLen > bestSweepLen) {
           bestSweepLen = sweepLen;
           bestSweepStart = currentSweepStart;
           bestSweepEnd = currentSweepEnd;
         }

         currentSweepStart = currentSweepEnd = null;
       }
     } else {
       // we are in a sweep, and have maybe just started
       if (currentSweepStart === null)
         currentSweepStart = i;
     }
   }

   // assume we found something
   // the only way we didn't is if there are patterns in every 1-degree point of the rose
   var partition = Math.floor((currentSweepStart + currentSweepEnd) / 2);
   var partitionStart = Math.min(partition, (partition + 180) % 360);
   var partitionEnd = Math.max(partition, (partition + 180) % 360);

   debug('partitioning at ' + partitionStart + ' degrees');

   // loop over the patterns again and partition them
   var outA = [];
   var outB = [];

   patterns.forEach(function (pattern, i) {
     if (patternBearings[i] >= partitionStart && patternBearings[i] < partitionEnd)
       outA.push(pattern);
     else
       outB.push(pattern);
   });

   return [outA, outB];
 };
