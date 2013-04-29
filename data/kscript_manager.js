/*
Require all the neccessary stuff
 */
var events = require("events");
var fs = require("fs");
require("coffee-script");
var jsonValidator = require("amanda")("json");

/*
Module exports
(This is neccessary for multiple log screens)
 */
if (typeof exports !== "undefined") {
	KScript = exports;
} else {
	KScript = root.TcprWrapper = {};
}

/*
Prepare globals
 */
extensions = [];
mods = [];

var KScript = function () {}

if (typeof exports !== "undefined") {
	KScript = exports;
} else {
	KScript = root.KScript = {};
}
var Events = function () {}

Events.prototype = new events.EventEmitter;

var log = function (inLog, logType) {
	if (logType == undefined)
		logType = LogTypes.NORMAL;

	appEvents.emit("log", "manager", inLog, logType);
}

var ScriptTypes = {
	MOD : "Mod",
	EXTENSION : "Extension"
}

var Responses = {
	SCRIPT_NOT_FOUND : "script_not_found",
	CONFIG_NOT_FOUND : "config_not_found",
	CONFIG_PARSE_ERROR : "config_parse_error",
	CONFIG_MISSING_OBJECT_NAME : "config_missing_object_name"
}

KScript.Script = function () {
	this.type;
	this.name;
	this.script;
	this.scriptPath;
	this.config;
}

KScript.ModManager = function () {
	this.debug = true;

	this.files = [];
	this.load_extensions = [];
	this.load_mods = [];

	this.header;

	this.getFolders = function () {
		var extensionsList = fs.readdirSync("extensions");
		var modsList = fs.readdirSync("mods");
		this.files["extensions"] = [];
		this.files["mods"] = [];
		for (var i in extensionsList) {
			if (fs.statSync("./extensions/" + extensionsList[i]).isDirectory()) {
				this.files["extensions"].push(extensionsList[i]);
			}
		}
		for (var i in modsList) {
			if (fs.statSync("./mods/" + modsList[i]).isDirectory()) {
				this.files["mods"].push(modsList[i]);
			}
		}
	}

	this.getScript = function (scriptType, scriptFolder) {
		var folderName = (scriptType == ScriptTypes.MOD) ? "mods" : "extensions";
		var scriptPath = folderName + "/" + scriptFolder + "/" + "main";
		var configPath = folderName + "/" + scriptFolder + "/" + "package.cfg";

		var script;
		var config;

		var isCoffee = false;

		if (fs.existsSync(scriptPath + ".js")) {
			script = fs.readFileSync(scriptPath + ".js", "utf-8");
		} else if (fs.existsSync(scriptPath + ".coffee")) {
			script = fs.readFileSync(scriptPath + ".coffee", "utf-8");
			isCoffee = true;
		} else {
			return Responses.SCRIPT_NOT_FOUND;
		}

		if (fs.existsSync(configPath)) {
			try {
				config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
			} catch (getScriptE) {
				if (this.debug) {
					log(getScriptE, LogTypes.DEBUG);
				}

				return Responses.CONFIG_PARSE_ERROR;
			}
		} else
			return Responses.CONFIG_NOT_FOUND;

		config.script_type = scriptType;
		config.coffee = isCoffee;
		return {
			script : script,
			config : config
		};
	}

	this.analyze = function () {
		/* Determine validity of extensions */
		var allFiles = this.files["mods"].concat(this.files["extensions"]);

		/* Put scripts without errors here */
		var scripts = [];
		scripts[ScriptTypes.MOD] = [];
		scripts[ScriptTypes.EXTENSION] = [];

		/* Determine which scripts can be loaded at all */
		for (var load_script_index in allFiles) {
			var scriptType = (load_script_index < this.files["mods"].length)
			 ?
			ScriptTypes.MOD : ScriptTypes.EXTENSION;

			var loadScriptFolder = allFiles[load_script_index];
			var loadScript = this.getScript(scriptType, loadScriptFolder);

			if (typeof(loadScript) != "object") {
				switch (loadScript) {
				case Responses.SCRIPT_NOT_FOUND: {
						log(scriptType + " with folder " + loadScriptFolder + " is missing script file.", LogTypes.ERROR);
					}
					break;

				case Responses.CONFIG_NOT_FOUND: {
						log(scriptType + " with folder " + loadScriptFolder + " is missing config file.", LogTypes.ERROR);
					}
					break;

				case Responses.CONFIG_PARSE_ERROR: {
						log(scriptType + " with folder " + loadScriptFolder + " has invalid json format.", LogTypes.ERROR);
					}
					break;
				}
			} else {
				if (loadScript.config.enabled == false) {
					if (this.debug) {
						log(scriptType + " with folder " + loadScriptFolder + " is not enabled from config.",
							LogTypes.ERROR);
					}
				} else {
					var validation = this.validateConfigFile(loadScript.config);

					if (validation == null)
						scripts[scriptType].push(loadScript);
					else {
						log(scriptType + " with folder " + loadScriptFolder + " doesn't have valid" +
							" config structure.", LogTypes.ERROR);

						if (this.debug) {
							log(validation, LogTypes.DEBUG);
						}
					}
				}
			}
		}

		/* Sub functions for analyze */
		var getScriptById = function (sub_scriptType, sub_id) {
			for (var sub_script_index in scripts[sub_scriptType]) {
				var sub_script = scripts[sub_scriptType][sub_script_index];
				if (sub_script.config.id == sub_id) {
					return sub_script;
				}
			}

			return null;
		}

		/* Determine which extensions and mods "need to" / "can" be loaded */
		var reqExtList = [];
		var canBeLoadedMods = [];
		_.each(scripts[ScriptTypes.MOD], function (mod) {
			var canBeLoaded = true;
			_.each(mod.config.requirements.extensions, function (reqExt) {
				var tempScript = getScriptById(ScriptTypes.EXTENSION, reqExt);
				if (tempScript != null) {
					if (!_.contains(reqExtList, tempScript)) {
						reqExtList.push(tempScript);
					}
				} else {
					canBeLoaded = false;
					log(ScriptTypes.MOD + " with id \"" + mod.config.id + "\" is " +
						"trying to load extension with id \"" + reqExt + "\" that is not loaded.", LogTypes.ERROR);
				}
			});

			if (canBeLoaded) {
				canBeLoadedMods.push(mod);
			}
		});

		var mods = canBeLoadedMods;
		var extensions = reqExtList;

		return {
			mods : mods,
			extensions : extensions
		};
	}

	this.validateConfigFile = function (json) {
		var schema = {
			type : "object",
			properties : {
				id : {
					required : true,
					type : "string"
				},
				info : {
					required : true,
					type : "object",

					properties : {
						name : {
							required : true,
							type : "string"
						},

						desc : {
							required : true,
							type : "string"
						},

						author : {
							required : true,
							type : "string"
						},

						version : {
							required : true,
							type : "string"
						}
					}
				},
				enabled : {
					required : true,
					type : "boolean"
				}
			}
		};

		var returnResponse = false;
		jsonValidator.validate(json, schema, function (error) {
			returnResponse = error;
		});
		while (returnResponse == false) {};
		return returnResponse;
	}

	this.init = function () {
		this.getFolders();
		var scriptsToBeLoaded = this.analyze();
		this.header = fs.readFileSync("./data/kscript_scriptheader", "utf-8");
		this.loadScripts(scriptsToBeLoaded);
		appEvents.emit("loaded");
	}

	this.createTempScript = function (script) {
		if (script.config.header) {
			if (script.config.object_name == undefined) {
				return Responses.CONFIG_MISSING_OBJECT_NAME;
			}

			var tempHeader = this.header;
			tempHeader = tempHeader.split("$objectName$").join(script.config.object_name);
			tempHeader = tempHeader.split("$modId$").join(script.config.id);
			fs.writeFileSync("temp/" + script.config.id + ".js", tempHeader + script.script, "utf-8");
		} else {
			fs.writeFileSync("temp/" + script.config.id + ".js", script.script, "utf-8");
		}

		return "temp/" + script.config.id + ".js";
	}

	this.loadScripts = function (scripts) {
		var scriptsFailedToLoad = [];

		/* Load all scripts */
		_.each(scripts.extensions.concat(scripts.mods), function (script) {
			var tempScriptPath = this.createTempScript(script);
			if (tempScriptPath == Responses.CONFIG_MISSING_OBJECT_NAME) {
				log(script.config.script_type + " with id: \"" + script.config.id + "\" has header " +
					"enabled but is missing object name.", LogTypes.ERROR);
				return;
			}

			try {
				var tempScriptObject = new require("../" + tempScriptPath);

				/* Remove temporary script file */
				fs.unlinkSync(tempScriptPath);

				if (script.config.script_type == ScriptTypes.MOD)
					mods[script.config.id] = tempScriptObject;
				else
					extensions[script.config.id] = tempScriptObject;

				log(script.config.script_type + ": " + script.config.info.name + " loaded.", LogTypes.SUCCESS);
			} catch (scriptLoadException) {
				log(script.config.script_type + ": " + script.config.info.name + " failed to execute.",
					LogTypes.ERROR);
				if (this.debug) {
					log(scriptLoadException, LogTypes.DEBUG);
				}
			}
		}, this);
	}

	this.init();
}
