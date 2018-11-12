netrosa:
	sls invoke -f createNetrosaApiUser -d '{"name":"Steven Landers","company":"netvote", "email":"steven@netvote.io"}'

netvote:
	sls invoke -f createApiUser -d '{"name":"Steven Landers","company":"netvote", "email":"steven@netvote.io"}'	