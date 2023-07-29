var year = 2022;
var team = "all";
var wins = true;
var duration = 300;
var numtodisplay = 12;
var numframes = 10;

var margin = ({top: 16, right: 16, bottom: 16, left: 0});
var barsize = 40;
var width = 1200;
var height = margin.top + margin.bottom + (barsize * numtodisplay);

var x = d3.scaleLinear([0, 1], [margin.left, width - margin.right]);
var y = d3.scaleBand()
	.domain(d3.range(numtodisplay + 1))
	.rangeRound([margin.top, margin.top + barsize * (numtodisplay + 1 + 0.1)])
	.padding(0.1);

var data = [];
var keyframes = [];
var currentIndex = 0;
var prev = [];
var next = [];
var regions = [];
var wcdates = [];
var wcteams = [];

var updateBars;
var updateLabels;
var updateAxis;
var updateTicker;

const dataFile = "data/wc_data.csv";

function initializeData() {
	if (data.length > 0) {
		processData();
		return;
	}

	d3.csv(dataFile).then(function(wcdata) {
		data = wcdata;
		processCommonData();
		processData();
	});
}

function initializeScatterData() {
	if (data.length > 0) {
		processScatterData();
		return;
	}

	d3.csv(dataFile).then(function(wcdata) {
		data = wcdata;
		processCommonData();
		processScatterData();
	});
}

function processCommonData() {
	if (data.some(d => d.region !== undefined)) {
		regions = new Map(data.map(d => [d.name, d.region]))
	}

	wcdates = Array.from(new Set(data.map(d => new Date(d.date).getUTCFullYear())));
	wcteams = Array.from(new Set(data.map(d => d.name))).sort();
}

function processData() {
	const names = new Set(data.map(d => d.name));

	const datewins = Array.from(d3.rollup(data, ([d]) => +d.win_percentage, d => d.date, d => d.name))
	  .map(([date, data]) => [new Date(date), data])
	  .sort(([a], [b]) => d3.ascending(a, b))
	const dategoals = Array.from(d3.rollup(data, ([d]) => +d.goals_scored, d => d.date, d => d.name))
	  .map(([date, data]) => [new Date(date), data])
	  .sort(([a], [b]) => d3.ascending(a, b))

	const datevalues = (wins ? datewins : dategoals);

	function rank(value) {
		const data = Array.from(names, name => ({name, value: value(name)}));
		data.sort((a, b) => d3.descending(a.value, b.value));
		for (let i = 0; i < data.length; ++i) {
			data[i].rank = Math.min(numtodisplay, i);
		}

		return data;
	}

	keyframes = [];
	let ka, a, kb, b;
	for ([[ka, a], [kb, b]] of d3.pairs(datevalues)) {
		for (let i = 0; i < numframes; ++i) {
			const t = i / numframes;
			keyframes.push([
				new Date(ka * (1 - t) + kb * t),
				rank(name => (a.get(name) || 0) * (1 - t) + (b.get(name) || 0) * t)
			]);
		}
	}
	keyframes.push([new Date(kb), rank(name => b.get(name) || 0)]);

	const nameframes = d3.groups(keyframes.flatMap(([, data]) => data), d => d.name);
	prev = new Map(nameframes.flatMap(([, data]) => d3.pairs(data, (a, b) => [b, a])));
	next = new Map(nameframes.flatMap(([, data]) => d3.pairs(data)));

	initchart();
}

async function initchart() {
	const chartType = (wins ? "" : "goals");

	const svg = d3.select(".barchart" + chartType).append("svg");
	svg.attr("id", "d3barchart" + chartType)
		.attr("viewBox", [0, 0, width, height])
		.attr("width", width)
		.attr("height", height)
		.attr("style", "max-width: 100%; height: auto;");

	await drawchart(true, 0);

	const scale = d3.scaleOrdinal(d3.schemePaired);
	if (regions.size > 0) {
		const regionNames = new Set(Array.from(regions.values()));
		scale.domain(regionNames);

		svg.selectAll("legenddots")
			.data(regionNames)
			.enter()
			.append("circle")
				.attr("cx", width - 15)
				.attr("cy", function(d, i) { return height - 230 + (i * 25); })
				.attr("r", 7)
				.style("fill", function(d) { return scale(d); })

		svg.selectAll("legendlabels")
			.data(regionNames)
			.enter()
			.append("text")
				.attr("x", width - 35)
				.attr("y", function(d,i){ return height - 230 + (i * 25); })
				.style("fill", function(d){ return scale(d)})
				.text(function(d){ return d})
				.attr("text-anchor", "end")
				.style("dominant-baseline", "middle")
	}
}

async function drawchart(firstlaunch, index) {
	currentIndex = index;

	const chartType = (wins ? "" : "goals");
	const svg = d3.select("#d3barchart" + chartType);

	if (currentIndex == 0) {
		svg.selectAll("*").remove();

		updateBars = drawBars(svg);
		updateLabels = drawLabels(svg);
		updateAxis = drawAxis(svg);
		updateTicker = drawTicker(svg, keyframes[0][0]);
	}

	for (var i = currentIndex; i < keyframes.length; i++) {
		const keyframe = keyframes[i];
		const transition = svg.transition()
			.duration(duration)
			.ease(d3.easeLinear)
			.on("interrupt", () => {
				currentIndex = i + 1;
			});

		x.domain([0, keyframe[1][0].value]);

		updateAxis(keyframe, transition);
		updateBars(keyframe, transition);
		updateLabels(keyframe, transition);

		if (wcdates.includes(keyframe[0].getUTCFullYear())) {
			updateTicker(keyframe, transition);
		}

		if (firstlaunch && i == 0) {
			currentIndex = i + 1;
			return;
		}

		await transition.end();
	}

	currentIndex = 0;
	d3.select("#startbutton" + chartType).text("Replay").attr("disabled", null);

	return this;
}

function stop(reset = false) {
	const chartType = (wins ? "" : "goals");

	const svg = d3.select("#d3barchart" + chartType);
	svg.interrupt();

	d3.select("#startbutton" + chartType).attr("disabled", null);

	if (reset) {
		d3.select(".barchart" + chartType).selectAll("*").remove();
		currentIndex = 0;
	}

	return this;
}

function start() {
	const chartType = (wins ? "" : "goals");

	drawchart(false, currentIndex);
	d3.select("#startbutton" + chartType).text("Play").attr("disabled", "disabled");
	return this;
}

function drawBars(svg) {
	let bar = svg.append("g")
		.attr("fill-opacity", 0.6)
		.selectAll("rect");

	return ([date, data], transition) => bar = bar
		.data(data.slice(0, numtodisplay), d => d.name)
		.join(
			enter => enter.append("rect")
				.attr("fill", color())
				.attr("height", y.bandwidth())
				.attr("x", x(0))
				.attr("y", d => y((prev.get(d) || d).rank))
				.attr("width", d => x((prev.get(d) || d).value) - x(0)),
			update => update,
			exit => exit.transition(transition).remove()
				.attr("y", d => y((next.get(d) || d).rank))
				.attr("width", d => x((next.get(d) || d).value) - x(0))
		)
		.call(bar => bar.transition(transition)
			.attr("y", d => y(d.rank))
			.attr("width", d => x(d.value) - x(0)));
}

function drawLabels(svg) {
	let label = svg.append("g")
		.style("font-size", "14px")
		.style("font-family", "sans-serif")
		.style("font-weight", "bold")
		.style("font-variant-numeric", "tabular-nums")
		.attr("text-anchor", "end")
		.selectAll("text");

	return ([date, data], transition) => label = label
		.data(data.slice(0, numtodisplay), d => d.name)
		.join(
			enter => enter.append("text")
				.attr("transform", d => `translate(${x((prev.get(d) || d).value)},${y((prev.get(d) || d).rank)})`)
				.attr("y", y.bandwidth() / 2)
				.attr("x", -6)
				.attr("dy", "-0.25em")
				.text(d => d.name)
				.call(text => text.append("tspan")
				.attr("fill-opacity", 0.7)
				.attr("font-weight", "normal")
				.attr("font-size", "14px")
				.attr("font-family", "sans-serif")
				.attr("x", -6)
				.attr("dy", "1.15em")),
			update => update,
			exit => exit.transition(transition).remove()
				.attr("transform", d => `translate(${x((next.get(d) || d).value)},${y((next.get(d) || d).rank)})`)
				.call(g => g.select("tspan").tween("text", d => textTween(d.value, (next.get(d) || d).value)))
		)
		.call(bar => bar.transition(transition)
			.attr("transform", d => `translate(${x(d.value)},${y(d.rank)})`)
			.call(g => g.select("tspan").tween("text", d => textTween((prev.get(d) || d).value, d.value))));
}

function drawAxis(svg) {
	const g = svg.append("g")
		.attr("transform", `translate(0,${margin.top})`);

	const axis = d3.axisTop(x)
		.ticks(width / 160, (wins ? ".0%" : "d"))
		.tickSizeOuter(0)
		.tickSizeInner(-barsize * (numtodisplay + y.padding()));

	return (_, transition) => {
		g.transition(transition).call(axis);
		g.select(".tick:first-of-type text").remove();
		g.selectAll(".tick:not(:first-of-type) line").attr("stroke", "white");
		g.select(".domain").remove();
  };
}

function drawTicker(svg, start) {
	const formatDate = d3.utcFormat("%Y");

	const now = svg.append("text")
		.style("font-size", "36px")
		.style("font-family", "sans-serif")
		.style("font-weight", "bold")
		.style("opacity", "0.5")
		.attr("text-anchor", "end")
		.attr("x", width - 6)
		.attr("y", margin.top + barsize * (numtodisplay - 0.45))
		.attr("dy", "0.32em")
		.text("World Cup " + formatDate(start));

	return ([date], transition) => {
		transition.end().then(() => now.text("World Cup " + formatDate(date)));
	};
}

function textTween(a, b) {
	const i = d3.interpolateNumber(a, b);
	const formatNumber = (wins ? d3.format(".0%") : d3.format("d"));
	return function(t) {
		this.textContent = formatNumber(i(t));
	};
}

function color() {
	const scale = d3.scaleOrdinal(d3.schemePaired);
	if (regions.size > 0) {
		scale.domain(Array.from(regions.values()));
		return d => scale(regions.get(d.name));
	}

	return d => scale(d.name);
}

// scatter chart variables

var scatterMargin = { top: 20, right: 20, bottom: 30, left: 35 };
var scatterWidth = 1200 - scatterMargin.left - scatterMargin.right;
var scatterHeight = 520 - scatterMargin.top - scatterMargin.bottom;

var scatterX = d3.scaleLinear()
	  .range([0, scatterWidth])
	  .nice();

var scatterY = d3.scaleLinear()
	.range([scatterHeight, 0]);

var xAxis = d3.axisBottom(scatterX).ticks(12);
var yAxis = d3.axisLeft(scatterY).ticks(15 * scatterHeight / scatterWidth, ".0%");

var brush = d3.brush().extent([[0, 0], [scatterWidth, scatterHeight]]).on("end", brushended),
	idleTimeout,
	idleDelay = 350;

var scatterSvg = d3.select(".wcscatter").append("svg")
	.attr("viewBox", [0, 0, scatterWidth + scatterMargin.left + scatterMargin.right, scatterHeight + scatterMargin.top + scatterMargin.bottom])
	.attr("width", scatterWidth + scatterMargin.left + scatterMargin.right)
	.attr("height", scatterHeight + scatterMargin.top + scatterMargin.bottom)
	.attr("style", "max-width: 100%; height: auto;")
	.append("g")
	.attr("transform", "translate(" + scatterMargin.left + "," + scatterMargin.top + ")");

var clip = scatterSvg.append("defs").append("clipPath")
	.attr("id", "clip")
	.append("rect")
	.attr("width", scatterWidth)
	.attr("height", scatterHeight )
	.attr("x", 0)
	.attr("y", 0);

var tooltip = d3.select(".wcscatter")
	.append("div")
	.style("opacity", 0)
	.attr("class", "tooltip");

var scatter;
var scatterAnnotations;

const averageGoals = (d) => { return d.goals_scored / d.total_matches_played; }

// scatter functions

function processScatterData() {
	d3.select("#scatteryear")
		.attr("disabled", null)
		.attr("max", wcdates.length - 1)
		.attr("value", wcdates.length - 1);

	d3.select("#wcyear").text(wcdates[wcdates.length - 1]);

    var selectTeam = d3.select("#wcteam");
    var options = selectTeam.selectAll("option");
	options.data(wcteams)
		.enter().append("option")
		.attr("class", "optionteam")
		.attr('value', function(d) { return d; })
		.text(function(d) { return d; });

	updateScatterData();
}

function updateScatterData() {
	const filtered = data.filter(function(d) {
		return (new Date(d.date).getUTCFullYear() == year);
	});

	const filteredTeams = Array.from(filtered.map(d => d.name)).sort();

	d3.selectAll("#wcteam").selectAll(".optionteam")
		.each(function(d) {
      		d3.select(this)
      			.attr("disabled", (filteredTeams.includes(d) ? null : "disabled"));
    	});

	scatterSvg.selectAll("*").remove();

	const maxX = d3.max(filtered, d => averageGoals(d)) + 0.2;
	const maxY = d3.max(filtered, d => +d.win_percentage) + 0.07;

	// Add a scale for bubble size
	const valueExtent = d3.extent(data, d => +d.total_matches_played)
	const size = d3.scaleSqrt()
		.domain(valueExtent)
		.range([1, 25]);

	// Create a color scale
	const color = d3.scaleLinear()
		.domain([0, 0.375, 0.75, 1.0])
		.range(["red", "yellow", "green", "green"]);

	scatterX.domain([-0.1, maxX]);
	scatterY.domain([-0.05, maxY]);

	// Add legend circles
	const valuesToShow = [3,40,120]
	const xCircle = scatterWidth - 30
	const xLabel = scatterWidth - 70
	const yLegend = scatterHeight - 50

	scatterSvg.selectAll("legend")
		.data(valuesToShow)
		.join("circle")
			.attr("cx", xCircle)
			.attr("cy", d => yLegend - size(d))
			.attr("r", d => size(d))
			.style("fill", "none")
			.attr("stroke", "black")

	scatterSvg.selectAll("legend")
		.data(valuesToShow)
		.join("line")
			.attr('x1', d => xCircle - size(d))
			.attr('x2', xLabel)
			.attr('y1', d => yLegend - size(d))
			.attr('y2', d => yLegend - size(d))
			.attr('stroke', 'black')
			.style('stroke-dasharray', ('2,2'))

	scatterSvg.selectAll("legend")
		.data(valuesToShow)
		.join("text")
			.attr('x', xLabel)
			.attr('y', d => yLegend - size(d))
			.text(d => d)
			.style("font-size", "12px")
			.attr('alignment-baseline', 'middle')
			.style("text-anchor", "end")

	scatterSvg.append("text")
	  .attr('x', scatterWidth)
	  .attr('y', yLegend - 10 - size(120) * 2)
	  .text("Matches Played")
	  .style("font-size", "12px")
	  .style("font-weight", "bold")
	  .style("text-anchor", "end")

	scatter = scatterSvg.append("g")
		.attr("id", "scatterplot")
		.attr("clip-path", "url(#clip)");

	scatter.append("g")
		.attr("class", "brush")
		.call(brush);

	var maxWin = 0.0;
	var maxData = null;
	scatter.selectAll(".dot")
		.data(filtered)
		.enter().append("circle")
		.attr("class", "dot")
		.attr("r",  function (d) { return size(d.total_matches_played); })
		.attr("cx", function (d) { return scatterX(averageGoals(d)); })
		.attr("cy", function (d) {
			if (d.win_percentage > maxWin) {
				maxWin = d.win_percentage;
				maxData = d;
			}
			return scatterY(d.win_percentage);
		})
		.attr("fill-opacity", 0.5)
		.style("stroke", function (d) { return color(d.win_percentage); })
		.style("stroke-width", 3)
		.style("fill", "#eee")
	    .on("mouseover", mouseover )
    	.on("mousemove", mousemove )
    	.on("mouseleave", mouseleave );

	// x axis
	scatterSvg.append("g")
	   .attr("class", "x axis")
	   .attr('id', "axis--x")
	   .attr("transform", "translate(0," + scatterHeight + ")")
	   .call(xAxis);

	scatterSvg.append("text")
		.style("text-anchor", "end")
		.attr("x", scatterWidth)
		.attr("y", scatterHeight - 8)
		.text("Average Goals Per Match")
		.attr("font-weight", "bold")
		.attr("font-size", "14px");

	// y axis
	scatterSvg.append("g")
		.attr("class", "y axis")
		.attr('id', "axis--y")
		.call(yAxis);

	scatterSvg.append("text")
		.attr("transform", "rotate(-90)")
		.attr("y", 6)
		.attr("dy", "1em")
		.style("text-anchor", "end")
		.text("Winning Percentage")
			.attr("font-weight", "bold")
			.attr("font-size", "14px");

	// Annotations and reference lines

	var annotations = []
	if (maxData) {
		annotations.push({
			note: {
			  label: maxData.name + " - " + Math.round(maxData.win_percentage * 100) + "%",
			  title: "Best Win Percentage",
			  padding: 10,
			  wrap: 200
			},
			connector: {"end": "arrow"},
			type: d3.annotationCalloutCircle,
			data: maxData,
			subject: {
			  radius: size(maxData.total_matches_played) + 20,
			  radiusPadding: 5
			},
			className: "maxwins",
			color: ["red"],
			x: scatterX(averageGoals(maxData)),
			y: scatterY(maxData.win_percentage),
			dy: 0,
			dx: -100,
			ny: 25,
		});

		// Add annotation to the chart
		scatterAnnotations = d3.annotation()
		  .annotations(annotations);

		scatterSvg.append("g")
			.attr("class", "annotation-group")
			.call(scatterAnnotations);

		d3.select(".maxwins")
			.style("pointer-events", "none");

		scatterAnnotations.update();
		scatterAnnotations.updateText();
	}

	scatterSvg.append("line")
    	.attr("class", 'reference-line')
        .attr("x1", 0)
		.attr("y1", scatterY(0.5))
		.attr("x2", scatterWidth)
		.attr("y2", scatterY(0.5))
		.style("stroke-dasharray", ("5, 5"))
		.style("stroke-opacity", 0.6)
		.style("stroke", "red");

	scatterSvg.append("text")
		.attr("class", "reference-text")
		.style("text-anchor", "end")
		.attr("x", scatterWidth)
		.attr("y", scatterY(0.5) - 8)
		.text("Winning Record")
		.attr("font-size", "14px")
		.attr("fill", "red");
}

function setScatterYear(value) {
	year = wcdates[value];
	d3.select("#wcyear").text(year);
	updateScatterData();
}

function setScatterTeam(option) {
	team = option.value;

	d3.selectAll(".dot")
		.each(function(d) {
      		d3.select(this)
      			.style("visibility", function (d) { return (team == "all" || d.name == team) ? "visible" : "hidden"; });
    	});

	d3.select(".maxwins")
		.style("visibility", function (d) { return (team == "all" || d.data.name == team) ? "visible" : "hidden"; });
}

function brushended(event) {
	const filtered = data.filter(function(d) {
		return new Date(d.date).getUTCFullYear() == year;
	});

	const maxX = d3.max(filtered, d => averageGoals(d)) + 0.2;
	const maxY = d3.max(filtered, d => +d.win_percentage) + 0.07;

	var s = event.selection;
	if (!s) {
		if (!idleTimeout) return idleTimeout = setTimeout(idled, idleDelay);
		scatterX.domain([-0.1, maxX]);
		scatterY.domain([-0.05, maxY]);
	}
	else {
		scatterX.domain([s[0][0] + 0.1, s[1][0] - 0.2].map(scatterX.invert, scatterX));
		scatterY.domain([s[1][1] + 0.05, s[0][1] - 0.07].map(scatterY.invert, scatterY));
		scatter.select(".brush").call(brush.move, null);
	}
	zoom();
}

function idled() {
	idleTimeout = null;
}

function zoom() {
	const duration = 750;
	scatterSvg.select("#axis--x").transition().duration(duration).call(xAxis);
	scatterSvg.select("#axis--y").transition().duration(duration).call(yAxis);

	scatter.selectAll("circle").transition().duration(duration)
		.attr("cx", function (d) { return scatterX(averageGoals(d)); })
		.attr("cy", function (d) { return scatterY(d.win_percentage); });

	const refY = scatterY(0.5);
	scatterSvg.select(".reference-line").transition().duration(duration)
		.attr("y1", refY)
		.attr("y2", refY);
	scatterSvg.select(".reference-text").transition().duration(duration)
		.attr("y", refY - 8);

	d3.select('.maxwins')
		.transition()
		.duration(duration)
		.tween("updateAnnotation", function(d) {
			xTrans = d3.interpolateNumber(d.x, scatterX(averageGoals(d.data)));
			yTrans = d3.interpolateNumber(d.y, scatterY(d.data.win_percentage));
			return function(t) {
				d.position = { x: xTrans(t), y: yTrans(t) }
				scatterAnnotations.update();
			}
		});
}

const mouseover = function(event, d) {
	d3.select(".tooltip")
		.transition().duration(100)
		.style("opacity", 1)
}

const mousemove = function(event, d) {
	var tooltipContent = "<h3 style='padding-bottom: 0px;'>" + d.name + "</h3><hr/>";
	tooltipContent += "<p>";
	tooltipContent += "Matches Played: <b>" + d.total_matches_played + "</b><br>";
	tooltipContent += "Goals Scored: <b>" + d.goals_scored + "</b><br>";
	tooltipContent += "Win %: <b>" + Math.round(d.win_percentage * 100) + "%</b><br>";
	tooltipContent += "Tie %: <b>" + Math.round(d.tie_percentage * 100) + "%</b>";
	tooltipContent += "</p>";
	tooltipContent += "<p>Total World Cups: <b>" + d.number_of_world_cups + "</b></p>";

	const clientRect = scatterSvg.node().getBoundingClientRect();

	d3.select(".tooltip")
		.html(tooltipContent)
		.style("left", (clientRect.x + 75) + "px")
		.style("top", (clientRect.y) + "px")
}

const mouseleave = function(event,d) {
	d3.select(".tooltip")
		.transition().duration(100)
		.style("opacity", 0)
}
