/*
	Require all the neccessary stuff
*/
var http = require("http"),
    url = require("url"),
    path = require("path"),
    fs = require("fs-extra"),
    events = require("events");
	unzip = require( "unzip" );

var c = require( "colors" );
var eventsRequire = new require( "events" );
	appEvents = new eventsRequire.EventEmitter;
var kscript_manager = require( "./kscript_manager" );
_ = require( "underscore" );
var prompt = require( "cli-prompt" );
var _version = fs.readFileSync( "./data/version.txt", "utf-8" );

var config =
{
	"server":
	{
		"ip" : "127.0.0.1",
		"port" : 50301,
		"rconPassword" : ""
	}
};
if (fs.existsSync('./kscript_config.cfg')) {
	config = JSON.parse( fs.readFileSync( "./kscript_config.cfg", "utf-8" ) );
} else {
	fs.writeFileSync( './kscript_config.cfg', JSON.stringify( config ), "utf-8" );
}

/*
	Log types enum for colored logs
*/
LogTypes =
{
	NORMAL : 0,
	ERROR : 1,
	DEBUG : 2,
	SUCCESS : 3
};

// TODO: Move this code somewhere else
DeathTypes =
{
	SLAIN: 0,
	GIBBED: 1,
	SHOT: 2,
	HAMMERED: 3,
	PUSHED: 4,
	ASSISTED: 5,
	SQUASHED: 6,
	FELL: 7,
	CYANIDE: 8,
	DIED: 9,
	UNKNOWN: 10
};

var logsManager = new function()
{
	this.logs = [];
	this.currentFocus = "app";
	var self = this;
	
	this.log = function( id, message, logType )
	{
		if( this.logs[ id ] == undefined )
			this.logs[ id ] = [];
			
		this.logs[ id ].push( { log_type : logType, message : message } );
		
		this.writeLog( message, logType );
	}
	
	this.writeLog = function( message, logType )
	{
		switch( logType )
		{
			case LogTypes.NORMAL:
				console.log( message );
			break;
			case LogTypes.ERROR:
				console.log( message.red );
			break;
			case LogTypes.DEBUG:
				console.log( message.toString().yellow );
			break;
			case LogTypes.SUCCESS:
				console.log( message.green );
			break;
		}
	}
	
	this.changeFocus = function( id, skipClean )
	{
		this.currentFocus = id;
		
		if( !skipClean )
			console.log( "\033[2J\033[0f" );
			
		console.log( id.toUpperCase().bold.green );
		_.each( self.logs[ id ], function( message )
		{
			self.writeLog( message.message, message.log_type );
		});
	}
}

var updatesManager = new function()
{
	var self = this;
	
	this.checkUpdate = function() {
		console.log("Checking updates...");
		var options = {
			host : 'kscript.kagdb.com',
			port : 80,
			path : '/api/update?v=' + _version + '&p=' + process.platform,
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
					if (data.version > _version) {
						console.log("Outdated version!");
						//self.downloadUpdate(data.version);
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
	}
	
	this.downloadUpdate = function(v) {
		var request = http.request({
			host : "kscript.kagdb.com",
			port : 80,
			path : "/api/dl?platform="+process.platform+"&package=kscript&branch=release&version="+v,
			method : "GET"
		});
		request.end();

		var dlprogress = 0;
		
		var timer = setInterval(function () {
			console.log("Download progress: " + dlprogress + " bytes");
		}, 1000);
		
		request.addListener('response', function (response) {
			if (response.statusCode == 404) {
				console.log("Remote file not found");
				clearInterval(timer);
				return;
			}
			response.setEncoding('binary')
			var contentDisposition = response.headers['content-disposition'];
			var filename = contentDisposition.substr(contentDisposition.indexOf('filename="')+10).slice(0,-1);
			console.log("Downloading file: " + filename);
			var body = '';
			response.addListener('data', function (chunk) {
				dlprogress += chunk.length;
				body += chunk;
			});
			response.addListener("end", function() {
				clearInterval(timer);
				fs.writeFileSync("./temp/"+filename, body, 'binary');
				console.log("Done downloading the update");
				self.installUpdate(filename);
			});
		});
	}
	
	this.installUpdate = function(f) {
		var d = './temp/'+f.substr(0, f.lastIndexOf('.'));
		console.log("Extracting "+f+" to "+d);
		fs.mkdir(d);
		fs.createReadStream('./temp/'+f).pipe(unzip.Extract({ path: d, type: 'Directory' }));
		fs.readdir(d, function(err, files) {
			_.each(files, function(file) {
				var src = d+'/'+file;
				var dst = './'+file;
				fs.copy(src,dst);
				console.log('Copied '+src+' to '+dst);
			});
			console.log('Done updating. Type restart to apply the update');
		});
	}
};

var promptHandler = new function()
{
	var self = this;
	this.commands = [];
	this.createCommand = function( command, inFunction )
	{
		this.commands[ command ] = inFunction;
	}
	
	this.command = function()
	{
		prompt( "", function( value, end )
		{
			value = value.substr( 0, value.length - 1 );
			try
			{
				self.commands[ value.split( " " )[ 0 ] ]( value );
			}
			catch( e )
			{
				console.log(e);
				console.log( "Unknown command" );
			}
			
			end();
			self.command();
		});
	}
}

promptHandler.createCommand( "focus", function( line )
{
	var lineArray = line.split( " " );
	logsManager.changeFocus( lineArray[ 1 ] );
});
promptHandler.createCommand( "update", function( line )
{
	updatesManager.checkUpdate();
});
promptHandler.createCommand( "restart", function( line )
{
	process.exit(0);
});
promptHandler.createCommand( "exit", function( line )
{
	process.exit(0);
});
promptHandler.createCommand("players", function(line) {
	console.log("________________________");
	console.log("Players count: "+ks.server.players.length);
	_.each(ks.server.players, function(p) {
		console.log((p.clanTag.length > 0 ? p.clanTag + " " : "") + p.name);
	});
	console.log("________________________");
});

appEvents.on( "log", function( id, inLog, logType )
{
	logsManager.log( id, inLog, logType );
});

console.log('KScript version '+_version);
logsManager.changeFocus( "ks", true );
ks = require( "./kscript_tcpr_wrapper" );
ks.rcon.connect( config.server.ip, config.server.port, config.server.rconPassword );

ks.events.on( "init", function()
{
	console.log();
	logsManager.changeFocus( "manager", true );
	var manager = new kscript_manager.ModManager();
	//var updater = new require( "./kscript_updater" );
	promptHandler.command();
});