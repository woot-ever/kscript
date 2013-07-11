kscript
=======

KScript - Scripting for KAG Classic

[Documentation](https://github.com/master4523/kscript/wiki/Documentation)

## How to install KScript?
1. Download [KScript (zip)](https://github.com/master4523/kscript/archive/master.zip)
2. Extract it somewhere on your computer
3. Open kscript_config.cfg and set the IP/port/rcon password of your server, then save and close the file
4. On your server, open the file located in Base/Security/dedicated_autoconfig.gm and make sure that sv_tcpr is set to 1
5. Launch kscript.bat (Windows) or kscript.sh (Linux)

## Troubleshooting
If you have this error:
`{ [Error: connect ECONNREFUSED]
  code: 'ECONNREFUSED',
  errno: 'ECONNREFUSED',
  syscall: 'connect' }`
You didn't put the correct informations in kscript_config.cfg and/or sv_tcpr is disabled on your server.
