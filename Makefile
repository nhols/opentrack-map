.PHONY: dev install start

dev: node_modules
	npm start

start: dev

install:
	npm install

node_modules: package-lock.json
	npm install
