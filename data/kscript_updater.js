var sys = require("sys"),
    http = require("http"),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    events = require("events");
	unzip = require( "unzip" );

var config = JSON.parse(fs.readFileSync("kscript_config.cfg", "utf-8"));

if (typeof exports !== "undefined") {
	KSUpdater = exports;
} else {
	KSUpdater = root.KSUpdater = {};
}

KSUpdater.start = function () {
	setInterval(this.checkUpdates, 3600000);
	this.checkUpdates();
};

KSUpdater.checkUpdates = function () {
	console.log("Checking updates...");
	var options = {
		host : 'kscript.kagdb.com',
		port : 80,
		path : '/update/update.php?v=' + config.version + '&p=' + config.platform,
		method : 'GET'
	};
	var req = http.get(options, function (res) {
		var pageData = "";
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
			pageData += chunk;
		});
		res.on('end', function () {
			try {
				var data = JSON.parse(pageData);
				if (pageData == null) {
					console.log("Couldn't check for updates");
					return;
				}
				if (data.version > config.version) {
					console.log("Outdated version!");
					KSUpdater.downloadUpdate(data.version);
				} else {
					console.log("Up to date");
				}
			} catch(e) {
				console.log(e);
				console.log("Couldn't check for updates");
				return;
			}
		});
	});
};

KSUpdater.downloadUpdate = function (v) {
	var downloadfile = "http://kscript.kagdb.com/update/dl.php?platform="+config.platform+"&package=kscript&branch=release&version="+v;

	var host = url.parse(downloadfile).hostname
	var filename = url.parse(downloadfile).pathname.split("/").pop()

	var theurl = http.createClient(80, host);
	var requestUrl = downloadfile;
	sys.puts("Downloading file: " + filename);
	sys.puts("Before download request");
	var request = theurl.request('GET', requestUrl, {"host": host});
	request.end();

	var dlprogress = 0;
	
	var timer = setInterval(function () {
		sys.puts("Download progress: " + dlprogress + " bytes");
	}, 1000);
	
	request.addListener('response', function (response) {
		response.setEncoding('binary')
		sys.puts("File size: " + response.headers['content-length'] + " bytes.")
		var body = '';
		response.addListener('data', function (chunk) {
			dlprogress += chunk.length;
			body += chunk;
		});
		response.addListener("end", function() {
			clearInterval(timer);
			fs.writeFileSync(filename, body, 'binary');
			sys.puts("After download finished");
		});
	});
};

this.start();
