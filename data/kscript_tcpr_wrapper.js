var events = require( "events" );
var net = require( "net" );

var TcprWrapper = function()
{
}

if( typeof exports !== "undefined" )
{
	TcprWrapper = exports;
}
else
{
	TcprWrapper = root.TcprWrapper = {};
}

var Events = function()
{
}

Events.prototype = new events.EventEmitter;

TcprWrapper.events = new Events;

var log = function( inLog, logType )
{
	if( logType == undefined )
		logType = LogTypes.NORMAL;
	
	appEvents.emit( "log", "ks", inLog, logType );
}

/* 
	Bug fixes
*/

TcprWrapper.unitsDepleted = false;
TcprWrapper.rconBlock = false;
TcprWrapper.matchStartTime;
TcprWrapper.matchEndTime;
TcprWrapper.init = false;
TcprWrapper.seclevs = [];

TcprWrapper.rcon = new function()
{
	var self = this;

	self.lineQueue = new Array();
	self.ip;
	self.port;
	self.rconPw;
	self.socket = new net.Socket();
	self.limit = 50;
	self.data = "";
	
	this.connect = function( ip, port, rcon, limit )
	{
		self.ip = ip;
		self.port = port;
		self.rconPw = rcon;
	
		self.socket.setEncoding( "utf8" );
		self.socket.setNoDelay();
		self.socket.setTimeout( 1000 );
		self.socket.connect( port, ip );	
		self.startInterval();
	}
	
	this.forceSend = function( data )
	{
		if( /*TcprWrapper.rconBlock || */self.socket == undefined ) {
			//console.log("rconBlock="+TcprWrapper.rconBlock);
			return;
		}
			
		self.socket.write( data + "\n", "utf8", function()
		{
		});		
	}
	
	this.send = function( data )
	{
		self.lineQueue.push( data );
	}
	
	this.socket.on( "connect", function()
	{
		self.forceSend( self.rconPw );
		
		TcprWrapper.server.updatePlayers();
		self.startInterval();
		log( "Connected to the server..." );
		TcprWrapper.events.emit( "connected" );
	});
	
	this.socket.on( "data", function( data )
	{
		self.data += data;
		if (data.indexOf('\n', data.length - ('\n').length) > -1) {
			TcprWrapper.events.emit( "rawRconData", self.data );
			TcprWrapper.parser.parseData( self.data.split("\n") );
			self.data = "";
		}
	});
	
	this.socket.on( "error", function(e)
	{
		log( e );
	});
	
	this.socket.on( "close", function(had_error)
	{
		log( "Socked closed" );
		log( "Reconnecting in 5 seconds..." );
		setTimeout(function() {
			self.connect( self.ip, self.port, self.rconPw, self.limit );
		}, 5000);
	});
	
	this.startInterval = function()
	{
		setInterval( function()
		{
			if( self.lineQueue.length > 0 )
			{
				self.forceSend( self.lineQueue[ self.lineQueue.length - 1 ] );
				self.lineQueue.splice( self.lineQueue.length - 1, 1 );
			}
		}, self.limit ); 
	}
	
	this.commands = [];
	this.createCommand = function( inCommand, inFunction )
	{
		this.commands.push( { command : inCommand, commandFunction : inFunction } );
	}
	this.getCommands = function() {
		return this.commands;
	}
}

TcprWrapper.parser = new function()
{
	this.parsingPlayers = false;
	this.parsingSeclevs = false;
	this.parsingSeclevsMapping = false;
	this.unknownLines = [];
	
	this.parseData = function( dataArray )
	{
		var dataTime = dataArray[0].substr(1, 8);
		var dataLine = dataArray[0].substr(11);
		if (dataLine.match(/^\/msg (.+)$/)) {
			dataArray.splice(0, 1);
		} else if (dataLine.match(/^(Can't spawn units depleted)$/)) {
			if( !TcprWrapper.unitsDepleted )
			{
				TcprWrapper.events.emit( "unitsDepleted" );
				TcprWrapper.unitsDepleted = true;
			}
			dataArray.splice(0, 1);
		} else if (dataLine.match(/^(\*Restarting Map\*)$/)) {
			dataArray.splice(0, 1);
		} else if (dataLine.match(/^(\*Match Started\*)$/)) {
			TcprWrapper.matchStartTime = new Date().getTime();
			TcprWrapper.rconBlock = false;
			TcprWrapper.unitsDepleted = false;
			TcprWrapper.events.emit( "matchStarted" );
			dataArray.splice(0, 1);
		} else if (dataLine.match(/^(\*Match Ended\*)$/)) {
			TcprWrapper.matchEndTime = new Date().getTime();
			setTimeout( function()
			{
				TcprWrapper.rconBlock = true;
				TcprWrapper.matchEnded = true;
			}, 1000 );
			TcprWrapper.events.emit( "matchEnded" );
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^(.+) (wins the game!)$/)) {
			var team = match[1];
			TcprWrapper.events.emit( "teamWins", team );
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^\* (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) (?:connected \(admin: [0-9]+ guard [0-9]+ gold [0-9]+\))$/)) {
			//var clan = match[1] == undefined ? "" : match[1].trim();
			//var playerName = match[2];
			//TcprWrapper.events.emit( "playerConnected", playerName ); // Not really useful because we don't have any informations yet (ip, hwid...)
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) (?:has joined) (.+)$/)) {
			var clan = match[1] == undefined ? "" : match[1].trim();
			var playerName = match[2];
			var team = match[3];
			var player = TcprWrapper.server.getPlayerByName(playerName);
			if (player) {
				var oldTeam = player.team;
				player.team = team;
				player.spectating = false;
				TcprWrapper.events.emit("teamChange", player, team, oldTeam);
			}
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) (?:is now spectating)$/)) {
			var clan = match[1] == undefined ? "" : match[1].trim();
			var playerName = match[2];
			var player = TcprWrapper.server.getPlayerByName(playerName);
			if (player) {
				player.team = null;
				player.spectating = true;
				TcprWrapper.events.emit("playerSpectating", player);
			}
			dataArray.splice(0, 1);
		} else if (dataLine.match(/^Unnamed player is now known as (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20})$/)) {
			TcprWrapper.rcon.send( "/players" );
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\\+=])?([\S]{1,20}) (?:is now known as) (.{0,5}[ \.,\["\{\}><\|\/\(\)\\\+=])?([\S]{1,20})$/)) {
			var oldClan = match[1] == undefined ? "" : match[1].trim();
			var oldName = match[2];
			var newClan = match[3] == undefined ? "" : match[3].trim();
			var newName = match[4];
			
			TcprWrapper.events.emit( "nameChange", oldClan, oldName, newClan, newName );
			
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^(?:Player) (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) (?:left the game \(players left [0-9]+\))$/)) {
			var clan = match[1] == undefined ? "" : match[1].trim();
			var playerName = match[2];

			var player = TcprWrapper.server.getPlayerByName(playerName);
			TcprWrapper.server.removePlayer( playerName );
			TcprWrapper.events.emit( "playerLeft", player );
			
			dataArray.splice(0, 1);
		} else if (dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) (slew|gibbed|shot|hammered|pushed|assisted|squashed|fell|took|died) ?(.+)?$/)) {
			var attackerName = "", victimName = "", deathType = DeathTypes.UNKNOWN;
			if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) slew (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) with (?:his|her) sword$/)) {
				// Slew
				attackerName = match[2];
				victimName = match[4];
				deathType = DeathTypes.SLAIN;
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) gibbed (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20})? into pieces$/)) {
				// Gibbed
				if (!match[4]) {
					// Gibbed himself, suicide
					victimName = match[2];
				} else {
					attackerName = match[2];
					victimName = match[4];
				}
				deathType = DeathTypes.GIBBED;
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) shot (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) with (?:his|her) arrow$/)) {
				// Shot
				attackerName = match[2];
				victimName = match[4];
				deathType = DeathTypes.SHOT;
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) hammered (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) to death$/)) {
				// Hammered
				attackerName = match[2];
				victimName = match[4];
				deathType = DeathTypes.HAMMERED;
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) pushed (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) (?:on a spike trap|to his death)$/)) {
				// Pushed
				attackerName = match[2];
				victimName = match[4];
				deathType = DeathTypes.PUSHED;
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) assisted in(?: squashing)? (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20})(?: dying)? under (?:a collapse|falling rocks)$/)) {
				// Assisted
				attackerName = match[2];
				victimName = match[4];
				deathType = DeathTypes.ASSISTED
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) was squashed under a collapse$/)) {
				// Squashed
				victimName = match[2];
				deathType = DeathTypes.SQUASHED
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) fell (?:(?:to (?:his|her) death)|(?:on a spike trap))$/)) {
				// Fell
				victimName = match[2];
				deathType = DeathTypes.FELL
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) took some cyanide$/)) {
				// Cyanide
				victimName = match[2];
				deathType = DeathTypes.CYANIDE
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) died under falling rocks$/)) {
				// Falling rocks
				victimName = match[2];
				deathType = DeathTypes.ROCKS;
			} else if (match = dataLine.match(/^(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20}) was killed by zombie$/)) {
				// Zombie
				victimName = match[2];
				deathType = DeathTypes.ZOMBIE;
			}
			
			if (deathType != DeathTypes.UNKNOWN) {
				var attacker = TcprWrapper.server.getPlayerByName(attackerName);
				var victim = TcprWrapper.server.getPlayerByName(victimName);
				TcprWrapper.events.emit( "playerKilled", victim, attacker, deathType );
			}
			
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^(List of Players ------ use RCON to get IP and hwid info)$/) || this.parsingPlayers) {
			// Remove "List of players ..."
			if (!this.parsingPlayers) {
				dataArray.splice(0, 1);
			}
			
			var line;
			for (var i=0; i<dataArray.length; i++) {
				line = dataArray[i].substr(11);
				if (match = line.match(/ {7}\[(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20})\] \(id ([0-9]+)\) \(ip (.+)\) \(hwid (.+)\)/)) {
					var clanTag = match[1] == undefined ? "" : match[1].trim();
					var playerName = match[2];
					var playerID = match[3];
					var playerIP = match[4];
					var playerHWID = match[5];
					if( TcprWrapper.server.getPlayerByName( playerName ) == null )
					{
						var newPlayer = new TcprWrapper.Player( clanTag, playerName, playerID, playerIP );
						TcprWrapper.server.addPlayer( newPlayer );
						TcprWrapper.events.emit( "newPlayer", newPlayer );
					}
				} else if (line.length > 0) {
					// Unknown line, maybe a chat message or something else?
					//console.log("Unknown line while parsing players: "+dataArray[i]);
					this.unknownLines.push(dataArray[i]);
				}
			}
			dataArray.splice(0, i);
			
			if( !TcprWrapper.init )
			{
				TcprWrapper.init = true;
				TcprWrapper.events.emit( "init" );
			}
			
			if (dataArray.length > 0) {
				// Still parsing
				this.parsingPlayers = true;
			} else {
				// Done parsing
				// Remove the blank line
				dataArray.splice(0, 1);
				this.parsingPlayers = false;
				if (this.unknownLines.length > 0) {
					var tmpLines = this.unknownLines;
					this.unknownLines = [];
					this.parseData(tmpLines);
				}
			}
		} else if (match = dataLine.match(/<(.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20})> ?(.+)?$/)) {
			var clanTag = match[1] == undefined ? "" : match[1].trim();
			var playerName = match[2];
			var chatLine = match[3] || '';
			var player = TcprWrapper.server.getPlayerByName( playerName );
			
			/*
				Just to make sure we don't send out errorous events
			*/
			if(player) {
				TcprWrapper.events.emit( "playerChat", player, chatLine, dataTime );
				
				if (chatLine.length > 0) {
					for( var commandIndex in TcprWrapper.chat.commands )
					{
						var tempChatCommand = TcprWrapper.chat.commands[ commandIndex ];
						if( tempChatCommand.command.toUpperCase() === chatLine.split(" ")[0].toUpperCase() )
						{
							tempChatCommand.commandFunction( player, chatLine, dataTime );
						}
					}
				}
			}
			
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^\[RCON (.{0,5}[ \.,\["\{\}><\|\/\(\)\\+=])?([\S]{1,20})\] ?(.+)?$/)) {
			//[18:33:35] [RCON [Pk#] master4523] /test
			var clanTag = match[1] == undefined ? "" : match[1].trim();
			var playerName = match[2];
			var chatLine = match[3] || '';
			var player = TcprWrapper.server.getPlayerByName( playerName );
			
			if (player) {
				TcprWrapper.events.emit("rconChat", player, chatLine, dataTime);
				
				for (var commandIndex in TcprWrapper.rcon.commands) {
					var tempRconCommand = TcprWrapper.rcon.commands[commandIndex];
					if (tempRconCommand.command.toUpperCase() === chatLine.split(" ")[0].toUpperCase()) {
						tempRconCommand.commandFunction(player, chatLine, dataTime);
					}
				}
			}
			
			dataArray.splice(0, 1);
		} else if (match = dataLine.match(/^(\/printseclevs)$/) || this.parsingSeclevs) {
			//console.log("PRINT SECLEVS");
			
			// Remove "/printseclevs" followed by an empty line
			if (!this.parsingSeclevs) {
				dataArray.splice(0, 2);
			}
			
			var line, tempSeclev = {};
			for (var i=0; i<dataArray.length; i++) {
				line = dataArray[i].substr(11);
				if (this.parsingSeclevsMapping) {
					//console.log("TODO: parse this line: "+line);
				} else if (match = line.match(/^name = ?(.+)?$/)) {
					tempSeclev.name = match[1];
				} else if (match = line.match(/^ID = ?([0-9]+)?$/)) {
					tempSeclev.id = match[1];
				} else if (match = line.match(/^users = ?(.+)?$/)) {
					var seclevUsers = new Array();
					if (match[1] != undefined) {
						var usersArray = match[1].split(';').slice(0, -1);
						for(var userIndex in usersArray) {
							seclevUsers.push(usersArray[userIndex].trim());
						}
					}
					tempSeclev.users = seclevUsers;
				} else if (match = line.match(/^roles = ?(.+)?$/)) {
					var seclevRoles = new Array();
					if (match[1] != undefined) {
						var rolesArray = match[1].split(';').slice(0, -1);
						for(var roleIndex in rolesArray) {
							seclevRoles.push(rolesArray[roleIndex].trim());
						}
					}
					tempSeclev.roles = seclevRoles;
				} else if (match = line.match(/^commands = ?(.+)?$/)) {
					var seclevCommands = new Array();
					if (match[1] != undefined) {
						var commandsArray = match[1].split(';').slice(0, -1);
						for(var commandIndex in commandsArray) {
							seclevCommands.push(commandsArray[commandIndex].trim());
						}
					}
					tempSeclev.commands = seclevCommands;
				} else if (match = line.match(/^features = ?(.+)?$/)) {
					var seclevFeatures = new Array();
					if (match[1] != undefined) {
						var featuresArray = match[1].split(';').slice(0, -1);
						for(var featureIndex in featuresArray) {
							seclevFeatures.push(featuresArray[featureIndex].trim());
						}
					}
					tempSeclev.features = seclevFeatures;
				} else if (match = line.match(/^assign = ?(.+)?$/)) {
					var seclevAssigns = new Array();
					if (match[1] != undefined) {
						var assignsArray = match[1].split(';').slice(0, -1);
						for(var assignIndex in assignsArray) {
							seclevAssigns.push(assignsArray[assignIndex].trim());
						}
					}
					tempSeclev.assigns = seclevAssigns;
				} else if (line.length == 0 && !this.parsingSeclevsMapping) {
					// Break
					if (_.size(tempSeclev) > 0) {
						TcprWrapper.seclevs.push(tempSeclev);
					}
					tempSeclev = {};
				} else if (line.match(/^Player-Seclev mappings:$/)) {
					this.parsingSeclevsMapping = true;
				} else {
					// TOOD: add unknownLines support
					//console.log("Wtf? line("+line.length+")="+line);
				}
			}
			//console.log(TcprWrapper.seclevs);
			dataArray.splice(0, i);
			
			if (dataArray.length > 0) {
				this.parsingSeclevs = true;
			} else {
				// Remove the blank line
				dataArray.splice(0, 1);
				
				this.parsingSeclevs = false;
			}
		} else {
			// The current line is useless
			if (dataLine.length > 0) {
				//console.log("Unknown line: "+dataLine);
			}
			dataArray.splice(0, 1);
		}
		if (dataArray.length > 0) {
			this.parseData(dataArray);
		}
	}
}

TcprWrapper.server = new function()
{
	var self = this;
	
	this.players = new Array();
	
	this.updatePlayers = function()
	{
		TcprWrapper.rcon.send( "/players" );
	}
	
	this.getPlayerById = function( id )
	{
		for( var player in self.players )
		{
			var tempPlayer = self.players[ player ];
			if( tempPlayer.id == id )
				return tempPlayer;
		}
		
		return null;
	}
	
	this.getPlayerByName = function( playerName )
	{
		for( var player in self.players )
		{
			var tempPlayer = self.players[ player ];
			if( tempPlayer.name == playerName )
				return tempPlayer;
		}
		
		return null;
	}
	
	this.getPlayerByPartialName = function( playerName )
	{
		for( var player in self.players )
		{
			var tempPlayer = self.players[ player ];
			if( tempPlayer.name.indexOf( playerName ) > -1 )
				return tempPlayer;
		}
		
		return null;
	}
	
	this.addPlayer = function( player )
	{
		/* Bug fix */
		//if( player.name.indexOf( "COLLAPSE by" ) > -1 )
			//return;
			
		self.players.push( player );
		log( "Added: " + player.name + " (" + self.players.length + ")");
	}
	
	this.removePlayer = function( playerName )
	{
		var len = self.players.length;
		while (len--) {
			var tempPlayer = self.players[len];
			if( tempPlayer.name == playerName )
			{
				log( "Removed: " + tempPlayer.name + " (" + (self.players.length-1) + ")");
				//delete self.players[i];
				self.players.splice(len, 1);
				return true;
			}
		}
		log( "Tried to remove " + playerName + " but doesn't exist" );
		return false;
	}
	
	this.message = function( message )
	{
		TcprWrapper.rcon.send( "/msg " + message);
	}
	
	this.setKillfeed = function(b) {
		TcprWrapper.rcon.send( "/cc_killfeed " + (b ? "1" : "0"));
	}
}

TcprWrapper.map = new function()
{
	this.spawnEntity = function( factory, config, x, y, team )
	{
		TcprWrapper.rcon.send( "addBlob(`" + factory + "`, `" + config + "`, " + x + ", " + y + ", " + team + ");" );
	}

	this.nextMap = function()
	{
		TcprWrapper.rcon.send( "/nextmap" );
	}
	
	this.restartMap = function()
	{
		TcprWrapper.rcon.send( "/restartmap" );
	}
	
	this.changeMap = function( map )
	{
		var mapArray = map.split( "." );
		if( mapArray[ mapArray.length - 1 ] == "png" )
		{
			TcprWrapper.rcon.send( "/loadbitmap " + map );
		}
		else
		{
			TcprWrapper.rcon.send( "/loadmap " + map );
		}
	}
}

TcprWrapper.Player = function( clanTag, name, id, ip )
{
	var self = this;
	
	this.clanTag = clanTag;
	this.name = name;
	this.team = null;
	this.spectating = false;
	this.id = id;
	this.ip = ip;
	this.data = {};
	
	this.kick = function()
	{
		TcprWrapper.rcon.send( "/kickid " + self.id );
	}
	
	this.freezeTimer;
	this.freeze = function( duration )
	{
		clearTimeout( this.freezeTimer );
		TcprWrapper.rcon.send( "/freezeid " + self.id );
		if( duration > 0 )
		{
			this.freezeTimer = setTimeout(this.unfreeze, duration);
		}
	}
	this.unfreeze = function()
	{
		clearTimeout( this.freezeTimer );
		TcprWrapper.rcon.send( "/unfreezeid " + self.id );
	}
	
	this.mute = function( duration )
	{
		if (!duration) duration = -1;
		TcprWrapper.rcon.send( "/muteid " + self.id + " " + duration );
	}
	this.unmute = function()
	{
		TcprWrapper.rcon.send( "/unmuteid " + self.id );
	}
	
	this.ban = function( duration )
	{
		if (!duration) duration = -1;
		TcprWrapper.rcon.send( "/banid " + self.id + " " + duration);
	}
	this.unban = function()
	{
		TcprWrapper.rcon.send( "/unban " + self.name );
	}
	
	this.swap = function()
	{
		TcprWrapper.rcon.send( "/swapid " + self.id );
	}
	
	this.getName = function() {
		return this.name;
	}
	
	this.getClanTag = function() {
		return this.clanTag;
	}
	
	this.getId = function() {
		return this.id;
	}
	
	this.getIP = function() {
		return this.ip;
	}
	
	this.getData = function() {
		return this.data;
	}
	
	this.getTeam = function() {
		return this.team;
	}
	
	this.isSpectating = function() {
		return this.spectating;
	}
}

/*
	Extra stuff
*/
TcprWrapper.chat = new function()
{
	this.commands = [];
	this.createCommand = function( inCommand, inFunction )
	{
		this.commands.push( { command : inCommand, commandFunction : inFunction } );
	}
	this.getCommands = function() {
		return this.commands;
	}
}
