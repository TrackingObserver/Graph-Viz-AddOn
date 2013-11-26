"use strict";

/* Constants */
var FORCE_LAYOUT_CHARGE = -400;
var EDGE_DISTANCE = 300;

var TRACKER_NODE_SIZE = 16;
var USER_SITE_NODE_SIZE = 16;
var NODE_OUTLINE_PADDING = 4;

/* Global Variables */
var forceLayout;
var svg;
var nodeConnections;

function initialize() {
    var to_id = "obheeflpdipmaefcoefhimnaihmhpkao";
    
	chrome.runtime.sendMessage(to_id, {type : 'getTrackers'},
		function(trackers) {
            		finishInitialize(trackers);
		});
}
        
function finishInitialize(trackers) {
	// add the click event handler to the "Tracker Category Info" link
	d3.select("#trackerCategoryInfoHeader a")
		.on("click", toggleTrackerCategoryInfoVisibility);
	
	// initialize the graph
	var width = window.innerWidth;
	var height = window.innerHeight;

	svg = d3.select("#viewport").append("svg")
		.attr("xmlns", "http://www.w3.org/2000/svg")
		.attr("width", width)
		.attr("height", height);
	
	// add extra elements and attributes to support dragging and zooming the
	// graph
	svg
		.attr("pointer-events", "all") 
		.append("g")
		.call(d3.behavior.zoom().on("zoom", zoom)) //TODO: broken; fix
		.append("g")
		.append("rect") // insert the containing rectangle
		.attr("width", width)
		.attr("height", height);
	
    /*var seen = [];
    d3.select("#log")
        .text(JSON.stringify(trackers, function(key, val) {
            if (typeof val == "object") {
        		if (seen.indexOf(val) >= 0)
            			return "seen"
	        	seen.push(val)
    		}
    		return val
        }), " ");*/
	
	var domainToNodeMap = {};
	// initialize domainToNodeMap
    for (var tracker in trackers) {
        domainToNodeMap[tracker] = trackers[tracker];
    }
	
	var nodes = []
	var edges = [];
	
    for (var tracker in trackers) {
        var newTrackerObject = trackers[tracker];
        newTrackerObject.isTracker = true;
        newTrackerObject.isUserSite = (trackers[tracker].categoryList.indexOf("E") != -1);
		nodes.push(newTrackerObject);
		
		var trackedSites = newTrackerObject.trackedSites;
		trackedSites.forEach(function(trackedSite) {
			if (!domainToNodeMap[trackedSite]) {
                var siteObject = {domain:trackedSite, 
                                  trackerCategories:"", 
                                  trackedSites:[],
                                  isTracker:false,
                                  isUserSite:true};
				nodes.push(siteObject);
				domainToNodeMap[trackedSite] = siteObject;
			}
			
            edges.push({
				source: trackers[tracker],
				target: domainToNodeMap[trackedSite]
            });
		});
	}
	
	initializeNodeConnectionsArray(edges);
	
	// initialize the force-directed layout
	forceLayout = d3.layout.force()
		.charge(FORCE_LAYOUT_CHARGE)
		.linkDistance(EDGE_DISTANCE)
		.size([width, height])
		.nodes(nodes)
		.links(edges)
		.start();
	
	// add an SVG line element to visually represent each edge
	// note: the SVG line elements must be added before the node elements;
	// otherwise the lines will be on top of the nodes
	var svgEdges = svg.selectAll(".edge")
		.data(edges)
		.enter()
		.append("line")
		.attr("class", "edge");
	
	// add an SVG element to visually represent each node
	var svgNodes = svg.selectAll(".node")
		.data(nodes)
		.enter()
		.append("g")
		.attr("class", "node")
		.call(forceLayout.drag);
	
	svgNodes.on("mouseover", function(node) {
			highlightConnectedNodes(svgNodes, svgEdges, node);
		})
		.on("mouseout", function() {
			unhighlightConnectedNodes(svgNodes, svgEdges);
		});
	
	// add the node outline shape
	svgNodes.append("path")
		.attr("d", d3.svg.symbol()
			.type(function(node) {
				if (node.isTracker && node.isUserSite) {
					return "triangle-up";
				} else if (node.isTracker) {
					return "square";
				} else { // node.isUserSite
					return "circle";
				}
			})
			.size(function(node) {
				if (node.isTracker && node.isUserSite) {
					return Math.pow(TRACKER_NODE_SIZE + NODE_OUTLINE_PADDING * 2, 2);
				} else if (node.isTracker) {
					return Math.pow(TRACKER_NODE_SIZE + NODE_OUTLINE_PADDING, 2);
				} else { // node.isUserSite
					return Math.pow(USER_SITE_NODE_SIZE + NODE_OUTLINE_PADDING, 2);
				}
			})
		)
		.attr("class", function(node) {
			if (node.isTracker && node.isUserSite) {
				return "tracker";
			} else if (node.isTracker) {
				return "tracker";
			} else {
				return "userSite";
			}
		});
	
	var faviconCheckbox = d3.select("#showFaviconsCheckbox");
	if (faviconCheckbox.property("checked")) {
		addFavicons(svgNodes);
	}
	faviconCheckbox.on("change", function() {
		if (faviconCheckbox.property("checked")) {
			addFavicons(svgNodes);
		} else {
			d3.selectAll("image").remove();
		}
	});
	
	var label = svgNodes.append("g")
		.attr("class", "label")
		.attr("transform", function(node) {
			var width = node.domain.length * 15;
			return "translate(" + -width / 2 + ",20)";
		}); // make the label appear below the node
	
	var labelRect = label.append("rect");
	labelRect.attr("width", function(node) {
		var width = getTextDimensions(node.domain).width;
		return width + 15 + "px";
	});
	
	labelRect.attr("height", function(node) {
		var height = getTextDimensions(node.domain).height;
		return height + 15 + "px";
	});
		
	label
		.append("text")
		.text(function (d) {
			var text = d.domain;
			
			return text;
		})
		.attr("x", 7.5)
		.attr("y", 20); //TODO: factor constants
	
	// what to do on each "tick" of the animation; update the x and y
	// coordinates of the nodes and edges
	forceLayout.on("tick", function() {
		updateNodeAndEdgePositions(svgNodes, svgEdges);
	});
}

function addFavicons(svgNodes) {
	svgNodes.each(function (node) {
		var domainUrl = "http://" + node.domain + "/";
		var faviconFound = false;
		var faviconUrl = "Images/world-globe-icon.jpg";
		var nodeDomElement = d3.select(this);
		
		d3.xhr(domainUrl + "favicon.ico", function(xhr) {
			if (xhr != null) {
				faviconUrl = domainUrl + "favicon.ico";
				faviconFound = true;
				nodeDomElement.append("image")
				.attr("xlink:href", faviconUrl)
				.attr("x", function(d) {
					if (d.isTracker) {
						return -TRACKER_NODE_SIZE / 2;
					} else {
						return -USER_SITE_NODE_SIZE / 2;
					}
				})
				.attr("y", function(d) {
					if (d.isTracker) {
						return -TRACKER_NODE_SIZE / 2;
					} else {
						return -USER_SITE_NODE_SIZE / 2;
					}
				})
				.attr("width", function(d) {
					if (d.isTracker) {
						return TRACKER_NODE_SIZE;
					} else {
						return USER_SITE_NODE_SIZE;
					}
				})
				.attr("height", function(d) {
					if (d.isTracker) {
						return TRACKER_NODE_SIZE;
					} else {
						return USER_SITE_NODE_SIZE;
					}
				});
			}
		});
		
		if (!faviconFound) {
			faviconFound = false;
		d3.html(domainUrl, function(htmlRootElement) {
			
			if (htmlRootElement != null) {
				var linkElements = document.getElementsByTagName("link");
				for (var i = 0; i < linkElements.length; i++) {
					var linkElement = linkElements[i];
			        if ((linkElement.getAttribute("rel") == "icon") ||
			        	(linkElement.getAttribute("rel") == "shortcut icon")) {
			            faviconUrl = linkElement.getAttribute("href");
			            faviconFound = true;
			            break;
			        }
			    }
			}
			
			if (faviconFound) {
				if (faviconUrl.indexOf("http://") == -1 &&
						faviconUrl.indexOf("https://") == -1) { // relative URL
					faviconUrl = domainUrl + faviconUrl;
				}
			}
					    
			nodeDomElement.append("image")
				.attr("xlink:href", faviconUrl)
				.attr("x", function(d) {
					if (d.isTracker) {
						return -TRACKER_NODE_SIZE / 2;
					} else {
						return -USER_SITE_NODE_SIZE / 2;
					}
				})
				.attr("y", function(d) {
					if (d.isTracker) {
						return -TRACKER_NODE_SIZE / 2;
					} else {
						return -USER_SITE_NODE_SIZE / 2;
					}
				})
				.attr("width", function(d) {
					if (d.isTracker) {
						return TRACKER_NODE_SIZE;
					} else {
						return USER_SITE_NODE_SIZE;
					}
				})
				.attr("height", function(d) {
					if (d.isTracker) {
						return TRACKER_NODE_SIZE;
					} else {
						return USER_SITE_NODE_SIZE;
					}
				});
		});
		}
	});
}

function highlightConnectedNodes(svgNodes, svgEdges, highlightedNode) {
	svgNodes.classed("highlighted", function(node) {
		return isConnected(node, highlightedNode);
	});
	svgNodes.classed("dimmed", function(node) {
		var nodeDomElement = d3.select(this);
		return !nodeDomElement.classed("highlighted");
	});
	
	svgEdges.classed("highlighted", function(edge) {
		return (edge.source === highlightedNode || edge.target === highlightedNode);
	});
	svgEdges.classed("dimmed", function(edge) {
		var nodeDomElement = d3.select(this);
		return !nodeDomElement.classed("highlighted");
	});
}

function getTextDimensions(text) {
	var testElement = document.createElement("span");
	testElement.className = "testElement";
	testElement.textContent = text;
	
	document.body.appendChild(testElement);
	
	var width = testElement.clientWidth;
	var height = testElement.clientHeight;
	
	document.body.removeChild(testElement);
	return {width: width, height: height};
}

function initializeNodeConnectionsArray(edges) {
	nodeConnections = {};
	
    edges.forEach(function(edge) {
        nodeConnections[edge.source.domain + "," + edge.target.domain] = true;
    });
}

function isConnected(node1, node2) {
    return node1.domain === node2.domain ||
    	nodeConnections[node1.domain + "," + node2.domain] ||
    	nodeConnections[node2.domain + "," + node1.domain];
}

function resizeViewport() {
	var width = window.innerWidth;
	var height = window.innerHeight;

	var svg = d3.select("#viewport svg, #viewport svg > g, #viewport svg > g > g, #viewport svg > g > g > rect")
		.attr("width", width)
		.attr("height", height);

	if (forceLayout) {	
		forceLayout.size([width, height]);
	}
}

function toggleTrackerCategoryInfoVisibility(event) {
	var trackerCategoryInfo = d3.select("#trackerCategoryInfoContainer");
	if (trackerCategoryInfo.attr("class") == "showing") {
		// the tracker category info popup is showing; need to hide it
		trackerCategoryInfo.attr("class", "");
	} else {
		// the tracker category info popup is hidden; need to show it
		trackerCategoryInfo.attr("class", "showing");
	}
	
	return false;
}

function updateNodeAndEdgePositions(svgNodes, svgEdges) {
	// nodes are SVG "g" elements; have to use the "transform" attribute
	// because they don't have "x" and "y" attributes
	svgNodes.attr("transform", function(node) {
		return "translate(" + node.x + "," + node.y + ")";
	});
	
	svgEdges.attr("x1", function(edge) { return edge.source.x; })
		.attr("y1", function(edge) { return edge.source.y; })
		.attr("x2", function(edge) { return edge.target.x; })
		.attr("y2", function(edge) { return edge.target.y; });
}

function unhighlightConnectedNodes(svgNodes, svgEdges) {
	svgNodes.classed("highlighted", false);
	svgNodes.classed("dimmed", false);
	
	svgEdges.classed("highlighted", false);
	svgEdges.classed("dimmed", false);
}

function zoom() {
	svg.attr("transform","translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
}

window.onload = initialize;
window.onresize = resizeViewport;
