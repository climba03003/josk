import { JoSk, RedisAdapter } from '../index.js';
import { createClient } from 'redis';

import parser  from 'cron-parser';
import { it, describe, before } from 'mocha';
import { assert } from 'chai';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL env.var is not defined! Please run test with REDIS_URL, like `REDIS_URL=redis://127.0.0.1:6379 npm test`');
}

const minRevolvingDelay = 32;
const maxRevolvingDelay = 256;
const RANDOM_GAP = (maxRevolvingDelay - minRevolvingDelay) + 1024;

const noop = (ready) => ((typeof ready === 'function') && ready());
const ZOMBIE_TIME = 8000;

const timestamps  = {};
const callbacks   = {};
const revolutions = {};

let client;
let job;
let jobCron;

const testInterval = function (interval) {
  it(`setInterval ${interval}`, function (endit) {
    process.nextTick(async () => {
      const taskId = await job.setInterval(noop, interval, `taskInterval-${interval}-${Math.random().toString(36).substring(2, 15)}`);
      callbacks[taskId] = endit;
      timestamps[taskId] = [Date.now() + interval];
      revolutions[taskId] = 0;
    });
  });
};

const testTimeout = function (delay) {
  it(`setTimeout ${delay}`, function (endit) {
    process.nextTick(async () => {
      const taskId = await job.setTimeout(noop, delay, `taskTimeout-${delay}-${Math.random().toString(36).substring(2, 15)}`);
      callbacks[taskId] = endit;
      timestamps[taskId] = [Date.now() + delay];
      revolutions[taskId] = 0;
    });
  });
};

before(async function () {
  client = await createClient({
    url: process.env.REDIS_URL
  }).connect();

  job = new JoSk({
    adapter: new RedisAdapter({
      client: client,
      prefix: 'testCaseNPM',
      resetOnInit: true
    }),
    autoClear: false,
    zombieTime: ZOMBIE_TIME,
    minRevolvingDelay,
    maxRevolvingDelay,
    onError(message, details) {
      console.info('[onError Hook] (this is purely informational message)', message, details);
      if (message === 'One of your tasks is missing') {
        // By the way the same can get achieved via `autoClear: true`
        // option passed to `new JoSk({/*...*/})`
        job.clearInterval(details.uid);
      }
    },
    onExecuted(uid, task) {
      if (!timestamps[task.uid]) {
        return;
      }

      ++revolutions[task.uid];
      if (timestamps[task.uid].length < 2) {
        timestamps[task.uid].push(task.timestamp);
      } else {
        timestamps[task.uid][1] = task.timestamp;
      }

      if ((task.uid.includes('taskInterval') || task.uid.includes('taskTimeout')) && timestamps[task.uid].length === 2) {
        const now      = Date.now();
        const expected = timestamps[task.uid][0];
        const _from    = expected - RANDOM_GAP;
        const _to      = expected + RANDOM_GAP;
        const diff     = now - expected;

        // console.log(task.uid, {diff, revs: revolutions[task.uid], delay: task.delay, uid, cb: callbacks[task.uid]});

        if (task.uid.includes('taskInterval')) {
          if (revolutions[task.uid] >= 2) {
            job.clearInterval(task.uid);
            assert.equal(revolutions[task.uid], 2, 'Interval second run');
            callbacks[task.uid]();
          } else {
            timestamps[task.uid][0] = now + task.delay;
            assert.equal(revolutions[task.uid], 1, 'Interval first run');
          }
        } else {
          assert.equal(revolutions[task.uid], 1, 'Timeout single run');
          callbacks[task.uid]();
        }
        assert.equal(_from < now && now < _to, true, 'Scheduled task has expected execution period');
        assert.equal(diff < RANDOM_GAP, true, 'Time execution difference less than random gap');
      }
    }
  });

  jobCron = new JoSk({
    adapter: new RedisAdapter({
      client: client,
      prefix: 'cron',
      resetOnInit: true
    }),
    debug: true,
    maxRevolvingDelay: 256, // <- Speed up timer speed by lowering its max revolving delay
    zombieTime: 1024, // <- will need to call `endit()` right away
    autoClear: true,
  });
});

describe('Redis - Has JoSk Object', function () {
  it('JoSk is Constructor', function () {
    assert.isFunction(JoSk, 'JoSk is Constructor');
  });
});

describe('Redis - JoSk', function () {
  this.slow(55000);
  this.timeout(100000);
  let overloadCronTimeouts = [];
  let overloadCronIntervals = [];

  describe('Redis - Instance', function () {
    it('Check JoSk instance properties', function () {
      assert.instanceOf(job, JoSk, 'job is instance of JoSk');
      assert.instanceOf(job.adapter, RedisAdapter, 'JoSk#adapter is instance of RedisAdapter');
      assert.equal(job.adapter.prefix, 'testCaseNPM', 'JoSk#adapter has .prefix');
      assert.equal(job.adapter.resetOnInit, true, 'JoSk#adapter has .resetOnInit');
      assert.isString(job.adapter.name, 'JoSk#adapter.name is {string}');
      assert.instanceOf(job.onError, Function, 'JoSk# has .onError');
      assert.equal(job.autoClear, false, 'JoSk# has .autoClear');
      assert.equal(job.zombieTime, ZOMBIE_TIME, 'JoSk# has .zombieTime');
      assert.instanceOf(job.onExecuted, Function, 'JoSk# has .onExecuted');
      assert.equal(job.minRevolvingDelay, minRevolvingDelay, 'JoSk# has .minRevolvingDelay');
      assert.equal(job.maxRevolvingDelay, maxRevolvingDelay, 'JoSk# has .maxRevolvingDelay');
      assert.instanceOf(job.tasks, Object, 'JoSk# has .tasks');
    });
  });

  describe('Redis - Methods', function () {
    it('ping', async function () {
      const pingRes = await job.ping();
      assert.isObject(pingRes, 'ping response is Object');
      assert.equal(pingRes.status, 'OK', 'ping.status');
      assert.equal(pingRes.code, 200, 'ping.code');
      assert.equal(pingRes.statusCode, 200, 'ping.statusCode');
      assert.isUndefined(pingRes.error, 'ping.error is undefined');
    });
  });

  describe('Redis - CRON usage', function () {
    this.slow(50000);
    this.timeout(60000);
    const maxRuns = 5;
    const timers = {};
    const runs = {};
    const createCronTask = async (uniqueName, cronTask, task, josk = jobCron) => {
      const next = +parser.parseExpression(cronTask).next().toDate();
      const timeout = next - Date.now();

      timers[uniqueName] = await josk.setTimeout(function (ready) {
        ready(() => { // <- call `endit()` right away
          // MAKE SURE FURTHER LOGIC EXECUTED
          // INSIDE endit() CALLBACK
          if (task()) { // <-- return false to stop CRON
            createCronTask(uniqueName, cronTask, task);
          }
        });
      }, timeout, uniqueName);

      return timers[uniqueName];
    };

    it('Create multiple CRON tasks to simulate load an concurrency', async function () {
      overloadCronTimeouts.push(await createCronTask('overload CRON 1', '* * * * * *', () => {
        // -- silence
      }, jobCron));

      overloadCronTimeouts.push(await createCronTask('overload CRON 2', '*/2 * * * * *', () => {
        // -- silence
      }, jobCron));

      overloadCronTimeouts.push(await createCronTask('overload CRON 3', '*/3 * * * * *', () => {
        // -- silence
      }, jobCron));

      overloadCronTimeouts.push(await createCronTask('overload CRON 4', '*/4 * * * * *', () => {
        // -- silence
      }, jobCron));

      overloadCronTimeouts.push(await createCronTask('overload CRON 5', '* * * * * *', () => {
        // -- silence
      }, jobCron));

      overloadCronIntervals.push(await job.setInterval(() => {
        // -- silence
      }, 1024, 'overload Interval 1'));

      overloadCronIntervals.push(await job.setInterval(() => {
        // -- silence
      }, 1025, 'overload Interval 2'));

      overloadCronIntervals.push(await job.setInterval(() => {
        // -- silence
      }, 1026, 'overload Interval 3'));

      overloadCronIntervals.push(await job.setInterval(() => {
        // -- silence
      }, 1027, 'overload Interval 4'));

      overloadCronIntervals.push(await job.setInterval(() => {
        // -- silence
      }, 1028, 'overload Interval 5'));
    });

    const testCreateCronTask = (sec) =>  {
      it(`Check CRON-like task (${sec}sec) intervals`, function (endit) {
        this.slow(sec * 1000 * maxRuns);
        this.timeout((sec * 1000 * maxRuns) + 2000);

        const cronTask = `*/${sec} * * * * *`;
        let expected = +parser.parseExpression(cronTask).next().toDate();
        const uniqueName = `every ${sec} seconds CRON` + Math.random();
        runs[uniqueName] = 0;

        createCronTask(uniqueName, cronTask, function runCronTask () {
          runs[uniqueName]++;

          const now = Date.now();
          const diff = expected - now;
          expected = +parser.parseExpression(cronTask).next().toDate();

          assert.ok(diff < 512, `CRON task interval in correct time gaps (< 512); diff: ${diff}; sec: ${sec}; run: ${runs[uniqueName]}`);
          assert.ok(diff > -512, `CRON task interval in correct time gaps (> 512); diff: ${diff}; sec: ${sec}; run: ${runs[uniqueName]}`);
          assert.ok(runs[uniqueName] <= maxRuns, `CRON task runs only desired amount of cycles; diff: ${diff}; sec: ${sec}; run: ${runs[uniqueName]}`);

          if (runs[uniqueName] >= maxRuns) {
            assert.ok(runs[uniqueName] === maxRuns, 'CRON task correctly cleared after 5 cycles');
            endit();
            return false;
          }

          return true;
        });
      });
    };

    testCreateCronTask(1);
    testCreateCronTask(2);
    testCreateCronTask(3);
    testCreateCronTask(4);
  });

  describe('Redis - setInterval', function () {
    this.slow(7680 * 2);
    this.timeout(8448 * 2);

    testInterval(384);
    testInterval(512);
    testInterval(640);
    testInterval(768);
    testInterval(778);
    testInterval(788);
    testInterval(789);
    testInterval(800);
    testInterval(801);
    testInterval(802);
  });

  describe('Redis - setTimeout', function () {
    this.slow(7680);
    this.timeout(8448);

    testTimeout(384);
    testTimeout(512);
    testTimeout(640);
    testTimeout(768);
    testTimeout(778);
    testTimeout(788);
    testTimeout(789);
    testTimeout(800);
    testTimeout(801);
    testTimeout(802);
  });

  describe('Redis - override settings', function () {
    this.slow(512);
    this.timeout(1024);

    it('setTimeout', async function () {
      const uid = await job.setTimeout(noop, 2048, 'timeoutOverride');
      const task = await job.adapter.client.hGetAll(`${job.adapter.uniqueName}:task:${uid}`);

      assert.ok(typeof task === 'object', 'setTimeout override — record exists');
      assert.equal(task.delay, 2048, 'setTimeout override — Have correct initial delay');
      await job.setTimeout(noop, 3072, 'timeoutOverride');

      assert.equal((await job.adapter.client.hGetAll(`${job.adapter.uniqueName}:task:${uid}`)).delay, 3072, 'setTimeout override — Have correct updated delay');

      const isRemoved = await job.clearTimeout(uid);
      assert.isTrue(isRemoved, 'timeoutOverride task is properly removed');
      assert.equal(await job.adapter.client.exists([`${job.adapter.uniqueName}:task:${uid}`]), false, 'setTimeout override — Task cleared');
    });

    it('setInterval', async function () {
      const uid = await job.setInterval(noop, 1024, 'intervalOverride');
      const task = await job.adapter.client.hGetAll(`${job.adapter.uniqueName}:task:${uid}`);

      assert.ok(typeof task === 'object', 'setInterval override — record exists');
      assert.equal(task.delay, 1024, 'setInterval override — Have correct initial delay');
      await job.setInterval(noop, 2048, 'intervalOverride');

      assert.equal((await job.adapter.client.hGetAll(`${job.adapter.uniqueName}:task:${uid}`)).delay, 2048, 'setInterval override — Have correct updated delay');

      const isRemoved = await job.clearInterval(uid);
      assert.isTrue(isRemoved, 'intervalOverride task is properly removed');
      assert.equal(await job.adapter.client.exists([`${job.adapter.uniqueName}:task:${uid}`]), false, 'setInterval override — Task cleared');
    });
  });

  describe('Redis - setImmediate', function () {
    this.slow(RANDOM_GAP * 3);
    this.timeout(RANDOM_GAP * 4);

    it('setImmediate - Execution time', function (endit) {
      const time = Date.now();
      job.setImmediate((ready) => {
        assert.equal(Date.now() - time < ((RANDOM_GAP * 2) + 1), true, 'setImmediate - executed within appropriate time');
        ready();
        endit();
      }, 'taskImmediate-0');
    });
  });

  describe('Redis - zombieTime (stuck task recovery)', function () {
    this.slow(768 * 3 + RANDOM_GAP);
    this.timeout(768 * 4 + RANDOM_GAP);

    it('setInterval', function (endit) {
      let time = Date.now();
      let i = 0;
      process.nextTick(async () => {
        const taskId = await job.setInterval(async () => {
          i++;
          if (i === 1) {
            const _time = Date.now() - time;
            assert.equal(_time < 768 + RANDOM_GAP, true, 'setInterval - first run within appropriate interval');
            time = Date.now();
          } else if (i === 2) {
            const _time = Date.now() - time;

            assert.equal(_time < (ZOMBIE_TIME + RANDOM_GAP), true, 'setInterval - recovered within appropriate zombieTime time-frame');
            const isRemoved = await job.clearInterval(taskId);
            assert.isTrue(isRemoved, 'taskInterval-zombie task is properly removed');
            endit();
          }
        }, 768, 'taskInterval-zombie-768');
      });
    });

    it('setTimeout', function (endit) {
      const time = Date.now();
      process.nextTick(async () => {
        const taskId = await job.setTimeout(async () => {
          const _time = Date.now() - time;

          assert.equal(_time < (ZOMBIE_TIME + RANDOM_GAP), true, 'setTimeout - recovered within appropriate zombieTime time-frame (which is actually the first run as it\'s Timeout)');
          const isRemoved = await job.clearTimeout(taskId);
          assert.isTrue(isRemoved, 'taskTimeout-zombie task is properly removed');
          endit();
        }, 768, 'taskTimeout-zombie-768');
      });
    });
  });

  describe('Redis - Clear (abort) current timers', function () {
    this.slow(2304);
    this.timeout(3072);

    it('setTimeout', function (endit) {
      let check = false;
      process.nextTick(async () => {
        const taskId = await job.setTimeout((ready) => {
          check = true;
          ready();
          assert.fail('setTimeout - executed after abort');
        }, 512, 'taskTimeout-clear-512');

        setTimeout(async () => {
          const isRemoved = await job.clearTimeout(taskId);
          assert.isTrue(isRemoved, 'setTimeout-clear task is properly removed');
          setTimeout(() => {
            assert.equal(check, false, 'setTimeout - is cleared and never executed');
            endit();
          }, 768);
        }, 384);
      });
    });

    it('setInterval', function (endit) {
      let check = false;
      process.nextTick(async () => {
        const taskId = await job.setInterval((ready) => {
          check = true;
          ready();
          assert.fail('setInterval - executed after abort');
        }, 512, 'taskInterval-clear-512');

        setTimeout(async () => {
          const isRemoved = await job.clearInterval(taskId);
          assert.isTrue(isRemoved, 'taskInterval-clear task is properly removed');
          setTimeout(() => {
            assert.equal(check, false, 'setInterval - is cleared and never executed');
            endit();
          }, 768);
        }, 384);
      });
    });
  });

  describe('Redis - Destroy (abort) current timers', function () {
    this.slow(2304);
    this.timeout(3072);

    it('setTimeout', function (endit) {
      let check = false;
      process.nextTick(async () => {
        const timeout1 = await job.setTimeout(() => {
          check = true;
          job.clearTimeout(timeout1);
          assert.fail('setInterval - executed after abort');
        }, 512, 'taskTimeout-destroy-512');

        setTimeout(() => {
          job.destroy();
          setTimeout(async () => {
            const isRemoved = await job.clearTimeout(timeout1);
            assert.isTrue(isRemoved, 'setTimeout-destroy task is properly removed');
            assert.equal(check, false, 'setTimeout - is destroyed/cleared and never executed');
            endit();
          }, 768);
        }, 384);
      });
    });

    it('setInterval + onError hook', function (endit) {
      let check1 = false;
      let check2 = false;
      let gotError = false;
      const job2 = new JoSk({
        adapter: new RedisAdapter({
          client: client,
          prefix: 'testCaseNPM2',
          resetOnInit: true
        }),
        autoClear: false,
        zombieTime: ZOMBIE_TIME,
        minRevolvingDelay,
        maxRevolvingDelay,
        onError(error) {
          gotError = error;
        }
      });

      process.nextTick(async () => {
        const interval1 = await job2.setInterval(() => {
          check1 = true;
          job2.clearInterval(interval1);
          assert.fail('setInterval 1 - executed after destroy');
        }, 512, 'taskInterval-destroy2-512');

        setTimeout(async () => {
          job2.destroy();
          const interval2 = await job2.setInterval(() => {
            check2 = true;
            job2.clearInterval(interval2);
            assert.fail('setInterval 2 - executed after destroy');
          }, 384, 'taskInterval-destroy2-384');

          setTimeout(async () => {
            const isRemoved1 = await job2.clearInterval(interval1);
            assert.isTrue(isRemoved1, 'taskInterval-destroy1 task is properly removed');
            const isRemoved2 = await job2.clearInterval(interval2);
            assert.isTrue(isRemoved2, 'taskInterval-destroy2 task is properly removed');

            assert.equal(check1, false, 'setInterval (before .destroy()) - is destroyed/cleared and never executed');
            assert.equal(check2, false, 'setInterval (after .destroy()) - is destroyed/cleared and never executed');
            assert.equal(gotError, 'JoSk instance destroyed', 'setInterval not possible to use after JoSk#destroy');
            endit();
          }, 768);
        }, 384);
      });
    });
  });

  describe('Redis - clean up and wrap up', function () {
    it('Disable overload CRONs', (endit) => {
      const length = overloadCronTimeouts.length;
      let cleared = 0;
      if (!length) {
        endit();
        return;
      }
      overloadCronTimeouts.forEach(async (timerId) => {
        await jobCron.clearTimeout(timerId);
        cleared++;
        if (cleared === length) {
          endit();
        }
      });
    });

    it('Disable overload Intervals', (endit) => {
      const length = overloadCronIntervals.length;
      let cleared = 0;
      if (!length) {
        endit();
        return;
      }
      overloadCronIntervals.forEach(async (timerId) => {
        const isRemoved = await job.clearInterval(timerId);
        cleared++;
        assert.equal(isRemoved, true, 'job.clearInterval.isRemoved !== true');
        if (cleared === length) {
          endit();
        }
      });
    });

    it('Check that collections are clear', async function () {
      const count = (await jobCron.adapter.client.keys(`${jobCron.adapter.uniqueName}:task:*`)).length;
      const count2 = (await job.adapter.client.keys(`${job.adapter.uniqueName}:task:*`)).length;
      assert.equal(count, 0, 'jobCron.count === 0');
      assert.equal(count2, 0, 'job.count === 0');
    });
  });
});
