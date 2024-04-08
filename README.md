[![support](https://img.shields.io/badge/support-GitHub-white)](https://github.com/sponsors/dr-dimitru)
[![support](https://img.shields.io/badge/support-PayPal-white)](https://paypal.me/veliovgroup)
<a href="https://ostr.io/info/built-by-developers-for-developers?ref=github-josk-repo-top"><img src="https://ostr.io/apple-touch-icon-60x60.png" height="20"></a>
<a href="https://meteor-files.com/?ref=github-josk-repo-top"><img src="https://meteor-files.com/apple-touch-icon-60x60.png" height="20"></a>

# JoSk

"JoSk" is a Node.js task manager for horizontally scaled apps, apps planning for horizontal scaling, and apps that would need to scale horizontally in the future with ease.

"JoSk" mimics the native API of `setTimeout` and `setInterval`. Tasks also can get scheduled using [CRON expressions](https://github.com/veliovgroup/josk?tab=readme-ov-file#cron). All queued tasks are synced between all running application instances via Redis, MongoDB, or [custom adapter](https://github.com/veliovgroup/josk/blob/master/docs/adapter-api.md).

"JoSk" package made for different variety of horizontally scaled apps as clusters, multi-server, and multi-threaded Node.js instances. That are running either on the same or different machines or even different data-centers. "JoSk" ensures that the only single execution of each *task* occurs across all running instances of the application.

Although "JoSk" is made with multi-instance apps in mind, — it works on a single-instance applications seamlessly.

__Note: JoSk is the server-only package.__

## ToC

- [Main features](https://github.com/veliovgroup/josk?tab=readme-ov-file#main-features)
- [Prerequisites](https://github.com/veliovgroup/josk?tab=readme-ov-file#prerequisites)
- [Install](https://github.com/veliovgroup/josk?tab=readme-ov-file#install) as [NPM package](https://www.npmjs.com/package/josk)
- [API](https://github.com/veliovgroup/josk?tab=readme-ov-file#api)
  - [Constructor `new JoSk()`](https://github.com/veliovgroup/josk?tab=readme-ov-file#initialization)
    - [`RedisAdapter`](https://github.com/veliovgroup/josk?tab=readme-ov-file#redis-adapter)
    - [`MongoAdapter`](https://github.com/veliovgroup/josk?tab=readme-ov-file#mongodb-adapter)
  - [`JoSk#setInterval()`](https://github.com/veliovgroup/josk?tab=readme-ov-file#setintervalfunc-delay-uid)
  - [`JoSk#setTimeout()`](https://github.com/veliovgroup/josk?tab=readme-ov-file#settimeoutfunc-delay-uid)
  - [`JoSk#setImmediate()`](https://github.com/veliovgroup/josk?tab=readme-ov-file#setimmediatefunc-uid)
  - [`JoSk#clearInterval()`](https://github.com/veliovgroup/josk?tab=readme-ov-file#clearintervaltimer--callback)
  - [`JoSk#clearTimeout()`](https://github.com/veliovgroup/josk?tab=readme-ov-file#cleartimeouttimer--callback)
  - [`JoSk#destroy()`](https://github.com/veliovgroup/josk?tab=readme-ov-file#destroy)
  - [`JoSk#ping()`](https://github.com/veliovgroup/josk?tab=readme-ov-file#ping)
- [Examples](https://github.com/veliovgroup/josk?tab=readme-ov-file#examples)
  - [CRON usage](https://github.com/veliovgroup/josk?tab=readme-ov-file#cron)
  - [Passing arguments](https://github.com/veliovgroup/josk?tab=readme-ov-file#pass-arguments)
  - [Clean up stale tasks](https://github.com/veliovgroup/josk?tab=readme-ov-file#clean-up-old-tasks)
  - [MongoDB connection options](https://github.com/veliovgroup/josk?tab=readme-ov-file#mongodb-connection-fine-tuning)
  - [Meteor.js](https://github.com/veliovgroup/josk/blob/master/docs/meteor.md)
- [Important notes](https://github.com/veliovgroup/josk?tab=readme-ov-file#notes)
- [~99% tests coverage](https://github.com/veliovgroup/josk?tab=readme-ov-file#running-tests)
- [Why it's named "JoSk"](https://github.com/veliovgroup/josk?tab=readme-ov-file#why-josk)
- [Support Section](https://github.com/veliovgroup/josk?tab=readme-ov-file#support-our-open-source-contribution)

## Main features

- 🏢 Synchronize single task across multiple servers;
- 🔏 Read locking to avoid simultaneous task executions across complex infrastructure;
- 📦 Zero dependencies, written from scratch for top performance;
- 👨‍🔬 ~99% tests coverage;
- 💪 Bulletproof design, built-in retries, and "zombie" task recovery 🧟🔫.

## Prerequisites

- `redis-server@>=5.0.0` — Redis Server Version (*if used with RedisAdapter*)
- `mongod@>=4.0.0` — MongoDB Server Version (*if used with MongoAdapter*)
- `node@>=14.20.0` — Node.js version

### Older releases compatibility

- `mongod@<4.0.0` — use `josk@=1.1.0`
- `node@<14.20.0` — use `josk@=3.0.2`
- `node@<8.9.0` — use `josk@=1.1.0`

## Install:

```shell
npm install josk --save
```

```js
// ES Module Style
import { JoSk, RedisAdapter, MongoAdapter } from 'josk';

// CommonJS
const { JoSk, RedisAdapter, MongoAdapter } = require('josk');
```

## API:

`new JoSk({opts})`:

- `opts.adapter` {*RedisAdapter*|*MongoAdapter*} - [Required] `RedisAdapter` or `MongoAdapter` or [custom adapter](https://github.com/veliovgroup/josk/blob/master/docs/adapter-api.md)
- `opts.client` {*RedisClient*} - [*Required for RedisAdapter*] `RedisClient` instance, like one returned from `await redis.createClient().connect()` method
- `opts.db` {*Db*} - [*Required for MongoAdapter*] Mongo's `Db` instance, like one returned from `MongoClient#db()` method
- `opts.lockCollectionName` {*String*} - [*Optional for MongoAdapter*] By default all JoSk instances use the same `__JobTasks__.lock` collection for locking
- `opts.prefix` {*String*} - [Optional] use to create multiple named instances
- `opts.debug` {*Boolean*} - [Optional] Enable debugging messages, useful during development
- `opts.autoClear` {*Boolean*} - [Optional] Remove (*Clear*) obsolete tasks (*any tasks which are not found in the instance memory (runtime), but exists in the database*). Obsolete tasks may appear in cases when it wasn't cleared from the database on process shutdown, and/or was removed/renamed in the app. Obsolete tasks may appear if multiple app instances running different codebase within the same database, and the task may not exist on one of the instances. Default: `false`
- `opts.resetOnInit` {*Boolean*} - [Optional] (*__use with caution__*) make sure all old tasks are completed during initialization. Useful for single-instance apps to clean up unfinished that occurred due to intermediate shutdown, reboot, or exception. Default: `false`
- `opts.zombieTime` {*Number*} - [Optional] time in milliseconds, after this time - task will be interpreted as "*zombie*". This parameter allows to rescue task from "*zombie* mode" in case when: `ready()` wasn't called, exception during runtime was thrown, or caused by bad logic. While `resetOnInit` option helps to make sure tasks are `done` on startup, `zombieTime` option helps to solve same issue, but during runtime. Default value is `900000` (*15 minutes*). It's not recommended to set this value to below `60000` (*one minute*)
- `opts.minRevolvingDelay` {*Number*} - [Optional] Minimum revolving delay — the minimum delay between tasks executions in milliseconds. Default: `128`
- `opts.maxRevolvingDelay` {*Number*} - [Optional] Maximum revolving delay — the maximum delay between tasks executions in milliseconds. Default: `768`
- `opts.onError` {*Function*} - [Optional] Informational hook, called instead of throwing exceptions. Default: `false`. Called with two arguments:
  - `title` {*String*}
  - `details` {*Object*}
  - `details.description` {*String*}
  - `details.error` {*Mix*}
  - `details.uid` {*String*} - Internal `uid`, suitable for `.clearInterval()` and `.clearTimeout()`
- `opts.onExecuted` {*Function*} - [Optional] Informational hook, called when task is finished. Default: `false`. Called with two arguments:
  - `uid` {*String*} - `uid` passed into `.setImmediate()`, `.setTimeout()`, or `setInterval()` methods
  - `details` {*Object*}
  - `details.uid` {*String*} - Internal `uid`, suitable for `.clearInterval()` and `.clearTimeout()`
  - `details.date` {*Date*} - Execution timestamp as JS {*Date*}
  - `details.delay` {*Number*} - Execution `delay` (e.g. `interval` for `.setInterval()`)
  - `details.timestamp` {*Number*} - Execution timestamp as unix {*Number*}

### Initialization

JoSk is storage-agnostic (since `v4.0.0`). It's shipped with Redis and MongoDB "adapters" out of the box, with option to extend its capabilities by creating and passing a [custom adapter](https://github.com/veliovgroup/josk/blob/master/docs/adapter-api.md)

#### Redis Adapter

JoSk has no dependencies, hence make sure `redis` NPM package is installed in order to support Redis Storage Adapter. `RedisAdapter` utilize basic set of commands `SET`, `GET`, `DEL`, `EXISTS`, `HSET`, `HGETALL`, and `SCAN`. `RedisAdapter` is compatible with all Redis-alike databases, and was well-tested with [Redis](https://redis.io/) and [KeyDB](https://docs.keydb.dev/)

```js
import { JoSk, RedisAdapter } from 'josk';
import { createClient } from 'redis';

const redisClient = await createClient({
  url: 'redis://127.0.0.1:6379'
}).connect();

const jobs = new JoSk({
  adapter: RedisAdapter,
  client: redisClient,
});
```

#### MongoDB Adapter

JoSk has no dependencies, hence make sure `mongodb` NPM package is installed in order to support MongoDB Storage Adapter. Note: this package will add two new MongoDB collections per each `new JoSk({ prefix })`. One collection for tasks and second for "Read Locking" with `.lock` suffix

```js
import { JoSk, MongoAdapter } from 'josk';
import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://127.0.0.1:27017');
// To avoid "DB locks" — it's a good idea to use separate DB from the "main" DB
const mongoDb = client.db('joskdb');
const jobs = new JoSk({
  adapter: MongoAdapter,
  db: mongoDb,
});
```

#### Create the first task

After JoSk initialized simply call `JoSk#setInterval` to create recurring task

```js
const jobs = new JoSk({ /*...*/ });

const task = function (ready) {
  /* ...code here... */
  ready();
};

const asyncTask = function (ready) {
  /* ...code here... */
  asyncCall(() => {
    /* ...more code here...*/
    ready();
  });
};

const asyncAwaitTask = async function (ready) {
  try {
    /* ...code here... */
    await asyncMethod();
    /* ...more code here...*/
    ready();
  } catch (err) {
    ready(); // <-- Always run `ready()`, even if error is thrown
  }
};

jobs.setInterval(task, 60 * 60 * 1000, 'task1h'); // every hour
jobs.setInterval(asyncTask, 15 * 60 * 1000, 'asyncTask15m'); // every 15 mins
jobs.setInterval(asyncAwaitTask, 30 * 60 * 1000, 'asyncAwaitTask30m'); // every 30 mins
```

### `setInterval(func, delay, uid)`

- `func` {*Function*} - Function to call on schedule
- `delay` {*Number*} - Delay for the first run and interval between further executions in milliseconds
- `uid` {*String*} - Unique app-wide task id
- Returns: {*String*}

*Set task into interval execution loop.* `ready()` *callback is passed as the first argument into a task function.*

In the example below, the next task __will not be scheduled__ until the current is ready:

```js
const syncTask = function (ready) {
  /* ...run sync code... */
  ready();
};

const asyncAwaitTask = async function (ready) {
  try {
    /* ...code here... */
    await asyncMethod();
    /* ...more code here...*/
    ready();
  } catch (err) {
    ready(); // <-- Always run `ready()`, even if error is thrown
  }
};

jobs.setInterval(syncTask, 60 * 60 * 1000, 'syncTask1h'); // will execute every hour + time to execute the task
jobs.setInterval(asyncAwaitTask, 60 * 60 * 1000, 'asyncAwaitTask1h'); // will execute every hour + time to execute the task
```

In the example below, the next task __will not wait__ for the current task to finish:

```js
const syncTask = function (ready) {
  ready();
  /* ...run sync code... */
};

const asyncAwaitTask = async function (ready) {
  ready();
  /* ...code here... */
  await asyncMethod();
  /* ...more code here...*/
};

jobs.setInterval(syncTask, 60 * 60 * 1000, 'syncTask1h'); // will execute every hour
jobs.setInterval(asyncAwaitTask, 60 * 60 * 1000, 'asyncAwaitTask1h'); // will execute every hour
```

In the next example, a long running task is executed in a loop without delay after the full execution:

```js
const longRunningAsyncTask = function (ready) {
  asyncCall((error, result) => {
    if (error) {
      ready(); // <-- Always run `ready()`, even if call was unsuccessful
    } else {
      anotherCall(result.data, ['param'], (error, response) => {
        if (error) {
          ready(); // <-- Always run `ready()`, even if call was unsuccessful
          return;
        }

        waitForSomethingElse(response, () => {
          ready(); // <-- End of the full execution
        });
      });
    }
  });
};

jobs.setInterval(longRunningAsyncTask, 0, 'longRunningAsyncTask'); // run in a loop as soon as previous run is finished
```

### `setTimeout(func, delay, uid)`

- `func` {*Function*} - Function to call after `delay`
- `delay` {*Number*} - Delay in milliseconds
- `uid` {*String*} - Unique app-wide task id
- Returns: {*String*}

*Run a task after delay in ms.* `setTimeout` *is useful for cluster - when you need to make sure task executed only once.* `ready()` *callback is passed as the first argument into a task function.*

```js
const syncTask = function (ready) {
  /* ...run sync code... */
  ready();
};

const asyncTask = function (ready) {
  asyncCall(function () {
    /* ...run async code... */
    ready();
  });
};

const asyncAwaitTask = async function (ready) {
  try {
    /* ...code here... */
    await asyncMethod();
    /* ...more code here...*/
    ready();
  } catch (err) {
    ready(); // <-- Always run `ready()`, even if error is thrown
  }
};

jobs.setTimeout(syncTask, 60 * 1000, 'syncTaskIn1m'); // will run only once across the cluster in a minute
jobs.setTimeout(asyncTask, 60 * 1000, 'asyncTaskIn1m'); // will run only once across the cluster in a minute
jobs.setTimeout(asyncAwaitTask, 60 * 1000, 'asyncAwaitTaskIn1m'); // will run only once across the cluster in a minute
```

### `setImmediate(func, uid)`

- `func` {*Function*} - Function to execute
- `uid`  {*String*}   - Unique app-wide task id
- Returns: {*String*}

*Immediate execute the function, and only once.* `setImmediate` *is useful for cluster - when you need to execute function immediately and only once across all servers.* `ready()` *is passed as the first argument into the task function.*

```js
const syncTask = function (ready) {
  //...run sync code
  ready();
};

const asyncTask = function (ready) {
  asyncCall(function () {
    //...run more async code
    ready();
  });
};

const asyncAwaitTask = async function (ready) {
  try {
    /* ...code here... */
    await asyncMethod();
    /* ...more code here...*/
    ready();
  } catch (err) {
    ready(); // <-- Always run `ready()`, even if error is thrown
  }
};

jobs.setImmediate(syncTask, 'syncTask'); // will run immediately and only once across the cluster
jobs.setImmediate(asyncTask, 'asyncTask'); // will run immediately and only once across the cluster
jobs.setImmediate(asyncAwaitTask, 'asyncTask'); // will run immediately and only once across the cluster
```

### `clearInterval(timer [, callback])`

- `timer` {*String*} — Timer id returned from `JoSk#setInterval()` method
- `[callback]` {*Function*} — [Optional] callback function, called with `error` and `result` arguments. `result` is `true` when task is successfully cleared, or `false` when task is not found

*Cancel current interval timer.* Must be called in a separate event loop from `setInterval`.

```js
const timer = jobs.setInterval(func, 34789, 'unique-taskid');
jobs.clearInterval(timer);
```

### `clearTimeout(timer [, callback])`

- `timer` {*String*} — Timer id returned from `JoSk#setTimeout()` method
- `[callback]` {*Function*} — [Optional] callback function, called with `error` and `result` arguments. `result` is `true` when task is successfully cleared, or `false` when task is not found

*Cancel current timeout timer.* Must be called in a separate event loop from `setTimeout`.

```js
const timer = jobs.setTimeout(func, 34789, 'unique-taskid');
jobs.clearTimeout(timer);
```

### `destroy()`

*Destroy JoSk instance*. This method shouldn't be called in normal circumstances. Stop internal interval timer. After JoSk is destroyed — calling public methods would end up logged to `std` or if `onError` hook was passed to JoSk it would receive an error. Only permitted methods are `clearTimeout` and `clearInterval`.

```js
// EXAMPLE: DESTROY JoSk INSTANCE UPON SERVER PROCESS TERMINATION
const jobs = new JoSk({ /* ... */ });

const cleanUpBeforeTermination = function () {
  /* ...CLEAN UP AND STOP OTHER THINGS HERE... */
  jobs.destroy();
  process.exit(1);
};

process.stdin.resume();
process.on('uncaughtException', cleanUpBeforeTermination);
process.on('exit', cleanUpBeforeTermination);
process.on('SIGHUP', cleanUpBeforeTermination);
```

### `ping()`

*Ping JoSk instance*. Check scheduler readiness and its connection to the "storage adapter"

```js
// EXAMPLE: DESTROY JoSk INSTANCE UPON SERVER PROCESS TERMINATION
const jobs = new JoSk({ /* ... */ });

const pingResult = jobs.ping();
console.log(pingResult)
/**
In case of the successful response
{
  status: 'OK',
  code: 200,
  statusCode: 200,
}

Failed response
{
  status: 'Error reason',
  code: 500,
  statusCode: 500,
  error: ErrorObject
}
*/
```

## Examples

Use cases and usage examples

### CRON

Use JoSk to invoke synchronized tasks by CRON schedule. Use [`cron-parser` package](https://www.npmjs.com/package/cron-parser) to parse CRON schedule into timestamp. To simplify CRON scheduling grab and use `createCronTask` function below:

```js
import parser from 'cron-parser';

const jobsCron = new JoSk({
  prefix: 'cron'
});

// CRON HELPER FUNCTION
const createCronTask = (uniqueName, cronTask, task) => {
  const next = +parser.parseExpression(cronTask).next().toDate();
  const timeout = next - Date.now();

  return jobsCron.setTimeout(function (done) {
    done(() => {
      task(); // <- Execute task
      createCronTask(uniqueName, cronTask, task); // <- Create task for the next iteration
    });
  }, timeout, uniqueName);
};

createCronTask('This task runs every 2 seconds', '*/2 * * * * *', function () {
  console.log(new Date);
});
```

### Pass arguments

Passing arguments can be done via wrapper function

```js
const jobs = new JoSk({ /* ... */ });
const myVar = { key: 'value' };
let myLet = 'Some top level or env.variable (can get changed during runtime)';

const task = function (arg1, arg2, ready) {
  //... code here
  ready();
};

const taskA = function (ready) {
  task(myVar, myLet, ready);
};

const taskB = function (ready) {
  task({ otherKey: 'Another Value' }, 'Some other string', ready);
};

jobs.setInterval(taskA, 60 * 60 * 1000, 'taskA');
jobs.setInterval(taskB, 60 * 60 * 1000, 'taskB');
```

### Clean up old tasks

During development and tests you may want to clean up Adapter's Storage

#### Clean up Redis

To clean up old tasks via Redis CLI use the next query pattern:

```shell
redis-cli --no-auth-warning KEYS "josk:default:*" | xargs redis-cli --raw --no-auth-warning DEL

# If you're using multiple JoSk instances with prefix:
redis-cli --no-auth-warning KEYS "josk:prefix:*" | xargs redis-cli --raw --no-auth-warning DEL
```

#### Clean up MongoDB

To clean up old tasks via MongoDB use the next query pattern:

```js
// Run directly in MongoDB console:
db.getCollection('__JobTasks__').remove({});
// If you're using multiple JoSk instances with prefix:
db.getCollection('__JobTasks__PrefixHere').remove({});
```

### MongoDB connection fine tuning

```js
// Recommended MongoDB connection options
// When used with ReplicaSet
const options = {
  writeConcern: {
    j: true,
    w: 'majority',
    wtimeout: 30000
  },
  readConcern: {
    level: 'majority'
  },
  readPreference: 'primary'
};

MongoClient.connect('mongodb://url', options, (error, client) => {
  // To avoid "DB locks" — it's a good idea to use separate DB from "main" application DB
  const db = client.db('dbName');
  const jobs = new JoSk({
    adapter: MongoAdapter,
    db: db,
  });
});
```

## Notes

- This package is perfect when you have multiple horizontally scaled servers for load-balancing, durability, an array of micro-services or any other solution with multiple running copies of code running repeating tasks that needs to run only once per application/cluster, not per server/instance;
- Limitation — task must be run not often than once per two seconds (from 2 to ∞ seconds). Example tasks: [Email](https://www.npmjs.com/package/mail-time), SMS queue, Long-polling requests, Periodical application logic operations or Periodical data fetch, sync, and etc;
- Accuracy — Delay of each task depends on storage and "de-synchronization delay". Trusted time-range of execution period is `task_delay ± (256 + Storage_Request_Delay)`. That means this package won't fit when you need to run a task with very precise delays. For other cases, if `±256 ms` delays are acceptable - this package is the great solution;
- Use `opts.minRevolvingDelay` and `opts.maxRevolvingDelay` to set the range for *random* delays between executions. Revolving range acts as a safety control to make sure different servers __not__ picking the same task at the same time. Default values (`128` and `768`) are the best for 3-server setup (*the most common topology*). Tune these options to match needs of your project. Higher `opts.minRevolvingDelay` will reduce storage read/writes;
- This package implements "Read Locking" via "RedLock" for Redis and dedicated `.lock` collection for MongoDB.

## Running Tests

1. Clone this package
2. In Terminal (*Console*) go to directory where package is cloned
3. Then run:

```shell
# Before running tests make sure NODE_ENV === development
# Install NPM dependencies
npm install --save-dev

# Before running tests you need
# to have access to MongoDB and Redis servers
REDIS_URL="redis://127.0.0.1:6379" MONGO_URL="mongodb://127.0.0.1:27017/npm-josk-test-001" npm test

# Be patient, tests are taking around 4 mins
```

### Run Redis tests only

Run Redis-related tests only

```shell
# Before running Redis tests you need to have Redis server installed and running
REDIS_URL="redis://127.0.0.1:6379" npm run test-redis

# Be patient, tests are taking around 2 mins
```

### Run MongoDB tests only

Run MongoDB-related tests only

```shell
# Before running Mongo tests you need to have MongoDB server installed and running
MONGO_URL="mongodb://127.0.0.1:27017/npm-josk-test-001" npm run test-mongo

# Be patient, tests are taking around 2 mins
```

## Why JoSk?

`JoSk` is *Job-Task* - Is randomly generated name by ["uniq" project](https://uniq.site)

## Support our open source contribution:

- Upload and share files using [☄️ meteor-files.com](https://meteor-files.com/?ref=github-josk-repo-footer) — Continue interrupted file uploads without losing any progress. There is nothing that will stop Meteor from delivering your file to the desired destination
- Use [▲ ostr.io](https://ostr.io?ref=github-josk-repo-footer) for [Server Monitoring](https://snmp-monitoring.com), [Web Analytics](https://ostr.io/info/web-analytics?ref=github-josk-repo-footer), [WebSec](https://domain-protection.info), [Web-CRON](https://web-cron.info) and [SEO Pre-rendering](https://prerendering.com) of a website
- Star on [GitHub](https://github.com/veliovgroup/josk)
- Star on [NPM](https://www.npmjs.com/package/josk)
- Star on [Atmosphere](https://atmospherejs.com/ostrio/cron-jobs)
- [Sponsor via GitHub](https://github.com/sponsors/dr-dimitru)
- [Support via PayPal](https://paypal.me/veliovgroup)
