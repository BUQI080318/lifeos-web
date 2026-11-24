import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
const errorText = runInNewContext(`(${source.slice(source.indexOf('function errorText('), source.indexOf('function showMode('))})`);

test('a login network failure gives a login-specific retry message', () => {
  for (const error of [
    new TypeError('Failed to fetch'),
    {name:'AuthRetryableFetchError', message:'{}', status:503},
    {name:'TimeoutError', message:'The operation timed out'}
  ]) {
    const message = errorText(error, 'auth');
    assert.match(message, /登录服务/);
    assert.doesNotMatch(message, /保存|草稿|密码不正确/);
  }
});

test('network failures distinguish mail, data reads and draft writes', () => {
  const error = new TypeError('Failed to fetch');
  assert.match(errorText(error, 'mail'), /邮件/);
  assert.match(errorText(error, 'read'), /读取/);
  assert.match(errorText(error, 'draft'), /保留当前草稿/);
  assert.doesNotMatch(errorText(error), /草稿/);
});

test('explicit credential and verification failures retain their guidance', () => {
  assert.match(errorText({code:'invalid_credentials'}, 'auth'), /邮箱或密码不正确/);
  assert.match(errorText({code:'email_not_confirmed'}, 'auth'), /注册验证/);
});

test('a rejected site API key is distinguishable from a wrong account password', () => {
  const message = errorText({name:'AuthApiError', status:401, message:'Invalid API key'}, 'auth');
  assert.match(message, /站点登录配置/);
  assert.match(message, /刷新/);
  assert.doesNotMatch(message, /密码|草稿/);
});

test('all authentication entrypoints load a versioned copy of the site configuration', () => {
  for (const file of ['index.html', 'auth/reset/index.html', 'auth/callback/index.html']) {
    const html = readFileSync(new URL('../site/' + file, import.meta.url), 'utf8');
    assert.match(html, /src="\/lifeos-web\/config\.js\?v=[a-z0-9-]+"/i, file);
  }
});
