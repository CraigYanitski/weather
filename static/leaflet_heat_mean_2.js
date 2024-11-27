/* 
Retrieved from https://leaflet.github.io/Leaflet.heat/dist/leaflet-heat.js 
Includes patch to fix weights issue (https://github.com/Leaflet/Leaflet.heat/pull/78) 
*/

/* 
(c) 2014, Vladimir Agafonkin 
simpleheat, a tiny JavaScript library for drawing heatmaps with Canvas 
https://github.com/mourner/simpleheat 
*/

(function () {
    "use strict";

    function SimpleHeat(canvas) {
        if (!(this instanceof SimpleHeat)) {
            return new SimpleHeat(canvas);
        }

        this._canvas = typeof canvas === "string" ? document.getElementById(canvas) : canvas;
        this._ctx = this._canvas.getContext("2d");
        this._width = this._canvas.width;
        this._height = this._canvas.height;
        this._max = 10;
        this.clear();
    }

    SimpleHeat.prototype = {
        defaultRadius: 25,
        defaultGradient: {
            0.4: "blue",
            0.6: "cyan",
            0.7: "lime",
            0.8: "yellow",
            1: "red"
        },

        // Set data points
        data: function (points) {
            this._data = points;
            return this;
        },

        // Set maximum intensity
        max: function (max) {
            this._max = max;
            return this;
        },

        // Add a single data point
        add: function (point) {
            this._data.push(point);
            return this;
        },

        // Clear all data points
        clear: function () {
            this._data = [];
            return this;
        },

        // Set the radius and blur
        radius: function (radius, blur) {
            blur = blur || 15;

            var circle = (this._circle = document.createElement("canvas")),
                ctx = circle.getContext("2d"),
                r = (this._r = radius + blur);

            circle.width = circle.height = r * 2;
            ctx.shadowOffsetX = ctx.shadowOffsetY = 200;
            ctx.shadowBlur = blur;
            ctx.shadowColor = "black";

            ctx.beginPath();
            ctx.arc(r - 200, r - 200, radius, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();

            return this;
        },

        // Define a gradient
        gradient: function (grad) {
            var canvas = document.createElement("canvas"),
                ctx = canvas.getContext("2d"),
                gradient = ctx.createLinearGradient(0, 0, 0, 256);

            canvas.width = 1;
            canvas.height = 256;

            for (var i in grad) {
                gradient.addColorStop(i, grad[i]);
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 1, 256);

            this._grad = ctx.getImageData(0, 0, 1, 256).data;

            return this;
        },

        // Draw the heatmap
        draw: function (minOpacity) {
            if (!this._circle) {
                this.radius(this.defaultRadius);
            }
            if (!this._grad) {
                this.gradient(this.defaultGradient);
            }

            var ctx = this._ctx;
            ctx.clearRect(0, 0, this._width, this._height);

            for (var i = 0, len = this._data.length; i < len; i++) {
                var point = this._data[i];
                ctx.globalAlpha = Math.max(point[2] / this._max, minOpacity || 0.05);
                ctx.drawImage(this._circle, point[0] - this._r, point[1] - this._r);
            }

            var imageData = ctx.getImageData(0, 0, this._width, this._height);
            this._colorize(imageData.data, this._grad);
            ctx.putImageData(imageData, 0, 0);

            return this;
        },

        // Apply colorization
        _colorize: function (pixels, gradient) {
            for (var i = 3, len = pixels.length; i < len; i += 4) {
                var alpha = pixels[i];
                if (alpha) {
                    var offset = alpha * 4;
                    pixels[i - 3] = gradient[offset];
                    pixels[i - 2] = gradient[offset + 1];
                    pixels[i - 1] = gradient[offset + 2];
                }
            }
        }
    };

    // Expose SimpleHeat globally
    window.simpleheat = SimpleHeat;
})();

/* 
Leaflet.heat, a tiny and fast heatmap plugin for Leaflet.
(c) 2014, Vladimir Agafonkin
https://github.com/Leaflet/Leaflet.heat 
*/

L.HeatLayer = (L.Layer ? L.Layer : L.Class).extend({
    initialize: function (latlngs, options) {
        this._latlngs = latlngs;
        L.setOptions(this, options);
    },

    setLatLngs: function (latlngs) {
        this._latlngs = latlngs;
        return this.redraw();
    },

    addLatLng: function (latlng) {
        this._latlngs.push(latlng);
        return this.redraw();
    },

    setOptions: function (options) {
        L.setOptions(this, options);
        if (this._heat) {
            this._updateOptions();
        }
        return this.redraw();
    },

    redraw: function () {
        if (this._heat && !this._frame && this._map && !this._map._animating) {
            this._frame = L.Util.requestAnimFrame(this._redraw, this);
        }
        return this;
    },

    onAdd: function (map) {
        this._map = map;

        if (!this._canvas) {
            this._initCanvas();
        }

        if (this.options.pane) {
            this.getPane().appendChild(this._canvas);
        } else {
            map._panes.overlayPane.appendChild(this._canvas);
        }

        map.on("moveend", this._reset, this);

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on("zoomanim", this._animateZoom, this);
        }

        this._reset();
    },

    onRemove: function (map) {
        if (this.options.pane) {
            this.getPane().removeChild(this._canvas);
        } else {
            map.getPanes().overlayPane.removeChild(this._canvas);
        }

        map.off("moveend", this._reset, this);

        if (map.options.zoomAnimation) {
            map.off("zoomanim", this._animateZoom, this);
        }
    },

    addTo: function (map) {
        map.addLayer(this);
        return this;
    },

    _initCanvas: function () {
        var canvas = (this._canvas = L.DomUtil.create("canvas", "leaflet-heatmap-layer leaflet-layer"));
        var originProp = L.DomUtil.testProp(["transformOrigin", "WebkitTransformOrigin", "msTransformOrigin"]);
        canvas.style[originProp] = "50% 50%";

        var size = this._map.getSize();
        canvas.width = size.x;
        canvas.height = size.y;

        var zoomAnimation = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(canvas, "leaflet-zoom-" + (zoomAnimation ? "animated" : "hide"));

        this._heat = simpleheat(canvas);
        this._updateOptions();
    },

    _updateOptions: function () {
        this._heat.radius(this.options.radius || this._heat.defaultRadius, this.options.blur);
        if (this.options.gradient) {
            this._heat.gradient(this.options.gradient);
        }
    },

    _reset: function () {
        var topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        var size = this._map.getSize();
        if (this._heat._width !== size.x) {
            this._canvas.width = this._heat._width = size.x;
        }
        if (this._heat._height !== size.y) {
            this._canvas.height = this._heat._height = size.y;
        }

        this._redraw();
    },

    _redraw: function () {
        if (this._map) {
            var r = this._heat._r;
            var size = this._map.getSize();
            var bounds = new L.Bounds(L.point([-r, -r]), size.add([r, r]));
            var cellSize = r / 2;
            var data 
            var grid = [];
			var cgrid = [];
            var max = 10;

            for (var i = 0, len = this._latlngs.length; i < len; i++) {
                var latlng = this._latlngs[i];
                var point = this._map.latLngToContainerPoint(latlng);
                var x = Math.floor(point.x / cellSize) + 2;
                var y = Math.floor(point.y / cellSize) + 2;

                var alt = 1;//latlng.alt !== undefined ? latlng.alt : (latlng[2] !== undefined ? +latlng[2] : 1);
                grid[y] = grid[y] || [];
				cgrid[y] = [];
                var cell = grid[y][x];
				var count = cgrid[y][x];
                if (cell) {
                    cell[0] = (cell[0] * cell[2] + point.x * alt) / (cell[2] + alt);
                    cell[1] = (cell[1] * cell[2] + point.y * alt) / (cell[2] + alt);
                    cell[2] += alt;
					//cell[3] += 1;
					count += 1;
                } else {
                    grid[y][x] = [point.x, point.y, alt];
					count += 1;
                }
                max = 5;//Math.max(max, alt);
            }
			for (var i = 0, len = grid.len; i < len; i++) {
                if grid[i] {
                    for (var j = 0, len2 = grid[i].length; j < len2; j++) {
                        cell = grid[i][j];
                        count = cgrid[i][j];
                        data.push([
                            cell[0],
                            cell[1],
                            cell[2]/count
                        ]);
                    }
                }
            }

            this._heat.data(data.flat()).max(max).draw(this.options.minOpacity);
            this._frame = null;
        }
    }
});

L.heatLayer = function (latlngs, options) {
    return new L.HeatLayer(latlngs, options);
};

