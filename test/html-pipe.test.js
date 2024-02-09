/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */
import assert from 'assert';
import esmock from 'esmock';
import { FileS3Loader } from './FileS3Loader.js';
import { htmlPipe, PipelineRequest, PipelineState } from '../src/index.js';

const DEFAULT_CONFIG = {
  contentBusId: 'foo-id',
  owner: 'adobe',
  repo: 'helix-pages',
  ref: 'main',
};

const DEFAULT_STATE = (config = DEFAULT_CONFIG, opts = {}) => (new PipelineState({
  config,
  site: 'site',
  org: 'org',
  ref: 'ref',
  partition: 'preview',
  s3Loader: new FileS3Loader(),
  ...opts,
}));

describe('HTML Pipe Test', () => {
  it('responds with 404 for invalid path', async () => {
    const resp = await htmlPipe(
      DEFAULT_STATE(DEFAULT_CONFIG, { path: '/../etc/passwd' }),
      new PipelineRequest(new URL('https://www.hlx.live/')),
    );
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(resp.headers.get('x-error'), 'invalid path');
  });

  it('responds with 400 for invalid xfh', async () => {
    const resp = await htmlPipe(
      DEFAULT_STATE(DEFAULT_CONFIG, {
        log: console,
        s3Loader: new FileS3Loader(),
        partition: 'live',
        path: '/',
      }),
      new PipelineRequest(new URL('https://www.hlx.live/'), {
        headers: {
          // eslint-disable-next-line no-template-curly-in-string
          'x-forwarded-host': '${jndi:dns://3.238.15.214/ORTbVlfjTl}',
        },
      }),
    );
    assert.strictEqual(resp.status, 400);
    // eslint-disable-next-line no-template-curly-in-string
    assert.strictEqual(resp.headers.get('x-error'), 'invalid url: https://${jndi:dns://3.238.15.214/ORTbVlfjTl}/');
  });

  it('responds with 500 for content-bus errors', async () => {
    const resp = await htmlPipe(
      new PipelineState({
        log: console,
        s3Loader: new FileS3Loader().status('index.md', 500),
        config: DEFAULT_CONFIG,
        site: 'site',
        org: 'org',
        ref: 'super-test',
        partition: 'live',
        path: '/',
      }),
      new PipelineRequest(new URL('https://www.hlx.live/')),
    );
    assert.strictEqual(resp.status, 502);
    // eslint-disable-next-line no-template-curly-in-string
    assert.strictEqual(resp.headers.get('x-error'), 'failed to load /index.md from content-bus: 500');
  });

  it('responds with 500 for pipeline errors', async () => {
    /** @type htmlPipe */
    const { htmlPipe: mockPipe } = await esmock('../src/html-pipe.js', {
      '../src/steps/fetch-content.js': () => {
        throw Error('kaputt');
      },
    });

    const resp = await mockPipe(
      DEFAULT_STATE(),
      new PipelineRequest(new URL('https://www.hlx.live/')),
    );
    assert.strictEqual(resp.status, 500);
    assert.strictEqual(resp.headers.get('x-error'), 'kaputt');
  });

  it('serves index.md', async () => {
    const s3Loader = new FileS3Loader();
    const state = DEFAULT_STATE(DEFAULT_CONFIG, {
      log: console,
      s3Loader,
      ref: 'super-test',
      partition: 'live',
      path: '/index.md',
      timer: {
        update: () => { },
      },
    });
    const resp = await htmlPipe(
      state,
      new PipelineRequest(new URL('https://www.hlx.live/')),
    );
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.body, '<!-- this is a test document -->\n# Hello\n\n');
    assert.deepStrictEqual(Object.fromEntries(resp.headers.entries()), {
      'content-type': 'text/markdown; charset=utf-8',
      'last-modified': 'Fri, 30 Apr 2021 03:47:18 GMT',
      'x-surrogate-key': '-RNwtJ99NJmYY2L- FzT3jXtDSYMYOTq1 foo-id_metadata super-test--helix-pages--adobe_head',
    });
  });

  it('renders /', async () => {
    const s3Loader = new FileS3Loader();
    const state = DEFAULT_STATE(DEFAULT_CONFIG, {
      log: console,
      s3Loader,
      ref: 'super-test',
      partition: 'live',
      path: '/',
      timer: {
        update: () => { },
      },
    });
    const resp = await htmlPipe(
      state,
      new PipelineRequest(new URL('https://www.hlx.live/')),
    );
    assert.strictEqual(resp.status, 200);
    assert.ok(resp.body.includes('<h1 id="hello">Hello</h1>'));
    assert.deepStrictEqual(Object.fromEntries(resp.headers.entries()), {
      'content-type': 'text/html; charset=utf-8',
      'last-modified': 'Fri, 30 Apr 2021 03:47:18 GMT',
      'x-surrogate-key': '-RNwtJ99NJmYY2L- FzT3jXtDSYMYOTq1 foo-id_metadata super-test--helix-pages--adobe_head',
    });
  });

  it('serves articles.md', async () => {
    const s3Loader = new FileS3Loader();
    const state = DEFAULT_STATE(DEFAULT_CONFIG, {
      log: console,
      s3Loader,
      ref: 'super-test',
      partition: 'live',
      path: '/articles.md',
      timer: {
        update: () => { },
      },
    });
    const resp = await htmlPipe(
      state,
      new PipelineRequest(new URL('https://www.hlx.live/')),
    );
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.body, '# Articles\n');
    assert.deepStrictEqual(Object.fromEntries(resp.headers.entries()), {
      'content-type': 'text/markdown; charset=utf-8',
      'last-modified': 'Fri, 30 Apr 2021 03:47:18 GMT',
      'x-surrogate-key': 'GWAg-4KOc8drP8BG iQzO-EvK0WKNO_o0 foo-id_metadata super-test--helix-pages--adobe_head',
    });
  });

  it('renders /articles', async () => {
    const s3Loader = new FileS3Loader();
    const state = DEFAULT_STATE(DEFAULT_CONFIG, {
      log: console,
      s3Loader,
      ref: 'super-test',
      partition: 'live',
      path: '/articles',
      timer: {
        update: () => { },
      },
    });
    const resp = await htmlPipe(
      state,
      new PipelineRequest(new URL('https://www.hlx.live/')),
    );
    assert.strictEqual(resp.status, 200);
    assert.ok(resp.body.includes('<h1 id="articles">Articles</h1>'));
    assert.deepStrictEqual(Object.fromEntries(resp.headers.entries()), {
      'content-type': 'text/html; charset=utf-8',
      'last-modified': 'Fri, 30 Apr 2021 03:47:18 GMT',
      'x-surrogate-key': 'GWAg-4KOc8drP8BG iQzO-EvK0WKNO_o0 foo-id_metadata super-test--helix-pages--adobe_head',
    });
  });

  it('renders static html with selector my-block.selector.html', async () => {
    const s3Loader = new FileS3Loader();
    const state = DEFAULT_STATE(DEFAULT_CONFIG, {
      log: console,
      s3Loader,
      owner: 'adobe',
      repo: 'helix-pages',
      ref: 'super-test',
      partition: 'live',
      path: '/my-block.selector.html',
      timer: {
        update: () => { },
      },
    });
    const resp = await htmlPipe(
      state,
      new PipelineRequest(new URL('https://www.hlx.live/')),
    );
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.body, '<html><body>static</body></html>\n');
    assert.deepStrictEqual(Object.fromEntries(resp.headers.entries()), {
      'content-type': 'text/html; charset=utf-8',
      'last-modified': 'Fri, 30 Apr 2021 03:47:18 GMT',
      'x-surrogate-key': 'Tl4ey1eS4kJ2iRMt kvcvppnfHtt5omSX foo-id_metadata super-test--helix-pages--adobe_head',
    });
  });
});
