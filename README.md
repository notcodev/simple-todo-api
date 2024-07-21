# 📝 Simple TODO Api

A simple RESTful API for managing a to-do list with anonymous sessions. The API supports creating, reading, updating, and deleting to-do items, and includes a cron job to clean up expired sessions and associated to-dos.

## How to start

First of all you need to clone this repository
```shell
git clone https://github.com/nothugofsea/simple-todo-api.git
cd simple-todo-api
```

### Development environment

Create `.env` and specify environment variables.
To start API in dev environment you need to install dependencies and start api using script from `package.json`
```shell
pnpm install

# For Windows
pnpm start:dev:windows
# For Linux / MacOS
pnpm start:dev:unix
```
