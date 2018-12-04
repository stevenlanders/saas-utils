netrosa:
	sls invoke -f createNetrosaApiUser -d '{"name":"raphael","company":"horizontal", "email":"raphael@hzontal.org"}'

netvote:
	sls invoke -f createApiUser -d '{"name":"Steven Landers","company":"netvote", "email":"steven@netvote.io"}'	