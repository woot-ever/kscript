ks.events.on('newPlayer', function(player) {
	ks.server.message('Hello, ' + player.getName() + '!');
});