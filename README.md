# Run instruction

## Install
npm install

## Run from root
Then to run from the root folder where the server.js is located, do:

node server.js

## Run from public
To start a server from the location of the index.html, do:

python -m http.server 8000

Then open

http://localhost:8000


If the address is already in use, do:

lsof -i :8000

To close the server, do:

kill <PID>

