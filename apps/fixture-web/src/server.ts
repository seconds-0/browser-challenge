import Fastify from 'fastify';

import { pageShell } from './template';

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 3000);

app.get('/', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      'index',
      `
    <h1>Fixture Levels</h1>
    <ol>
      <li><a href="/level/1">Level 1</a></li>
      <li><a href="/level/2">Level 2</a></li>
      <li><a href="/level/3">Level 3</a></li>
      <li><a href="/level/4">Level 4</a></li>
      <li><a href="/level/5">Level 5</a></li>
      <li><a href="/level/6">Level 6</a></li>
      <li><a href="/level/7">Level 7</a></li>
      <li><a href="/level/8">Level 8</a></li>
      <li><a href="/level/9">Level 9</a></li>
      <li><a href="/level/10">Level 10</a></li>
    </ol>
    `,
    ),
  );
});

app.get('/level/1', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '1',
      `
    <h1>Level 1</h1>
    <p>Click the correct button to advance.</p>
    <button data-testid="wrong">Wrong</button>
    <button data-testid="right" id="advance">Right</button>
    <div id="status"></div>
    <script>
      document.getElementById('advance').addEventListener('click', () => {
        document.body.dataset.level = '2';
        document.getElementById('status').textContent = 'advanced';
      });
    </script>
    `,
    ),
  );
});

app.get('/level/2', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '2',
      `
    <h1>Level 2</h1>
    <p>Use keyboard to advance (Enter).</p>
    <button data-testid="keyboard" id="kbd" tabindex="0">Press Enter</button>
    <div id="status"></div>
    <script>
      const btn = document.getElementById('kbd');
      btn.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          document.body.dataset.level = '3';
          document.getElementById('status').textContent = 'advanced';
        }
      });
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById('status').textContent = 'mouse blocked';
      });
    </script>
    `,
    ),
  );
});

app.get('/level/3', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '3',
      `
    <h1>Level 3</h1>
    <p>Overlay trap. Remove overlay then click the button.</p>
    <div id="overlay" class="overlay">
      <div class="card">
        <p>Overlay active</p>
        <button id="dismiss" data-testid="dismiss">Dismiss overlay</button>
      </div>
    </div>
    <button id="target" data-testid="target">Target</button>
    <div id="status"></div>
    <script>
      document.getElementById('dismiss').addEventListener('click', () => {
        document.getElementById('overlay').classList.add('hidden');
      });
      document.getElementById('target').addEventListener('click', () => {
        if (document.getElementById('overlay').classList.contains('hidden')) {
          document.body.dataset.level = '4';
          document.getElementById('status').textContent = 'advanced';
        } else {
          document.getElementById('status').textContent = 'blocked by overlay';
        }
      });
    </script>
    `,
    ),
  );
});

app.get('/level/4', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '4',
      `
    <h1>Level 4</h1>
    <p>Wait for the delayed button.</p>
    <div id="status"></div>
    <script>
      setTimeout(() => {
        const btn = document.createElement('button');
        btn.id = 'delayed';
        btn.dataset.testid = 'delayed';
        btn.textContent = 'Delayed';
        btn.addEventListener('click', () => {
          document.body.dataset.level = 'done';
          document.getElementById('status').textContent = 'advanced';
        });
        document.body.appendChild(btn);
      }, 1500);
    </script>
    `,
    ),
  );
});

app.get('/level/5', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '5',
      `
    <h1>Level 5</h1>
    <p>Press Space on the focused target.</p>
    <button data-testid="press-target" id="press-target">Target</button>
    <button data-testid="press-decoy" id="press-decoy">Decoy</button>
    <div id="status"></div>
    <script>
      const target = document.getElementById('press-target');
      target.addEventListener('keydown', (event) => {
        if (event.code === 'Space') {
          document.body.dataset.level = 'done';
          document.getElementById('status').textContent = 'advanced';
        }
      });
      document.getElementById('press-decoy').addEventListener('keydown', () => {
        document.getElementById('status').textContent = 'wrong target';
      });
    </script>
    `,
    ),
  );
});

app.get('/level/6', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '6',
      `
    <h1>Level 6</h1>
    <p>Scroll down to find the target.</p>
    <div style="height: 1600px;"></div>
    <button data-testid="scroll-target" id="scroll-target" style="margin-bottom: 24px;">Scroll Target</button>
    <div id="status"></div>
    <script>
      document.getElementById('scroll-target').addEventListener('click', () => {
        document.body.dataset.level = 'done';
        document.getElementById('status').textContent = 'advanced';
      });
    </script>
    `,
    ),
  );
});

app.get('/level/7', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '7',
      `
    <h1>Level 7</h1>
    <p>Use eval_js to advance.</p>
    <div id="status"></div>
    <script>
      window.advanceLevel = () => {
        document.body.dataset.level = 'done';
        document.getElementById('status').textContent = 'advanced';
      };
    </script>
    `,
    ),
  );
});

app.get('/level/8', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '8',
      `
    <h1>Level 8</h1>
    <p>Navigate to the next URL.</p>
    <button data-testid="nav" id="nav">Go next</button>
    <script>
      document.getElementById('nav').addEventListener('click', () => {
        window.location.href = '/level/8/next';
      });
    </script>
    `,
    ),
  );
});

app.get('/level/8/next', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '8-next',
      `
    <h1>Level 8 Complete</h1>
    <p>advanced</p>
    `,
    ),
  );
});

app.get('/level/9', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '9',
      `
    <h1>Level 9</h1>
    <p>Use role, text, and CSS selectors in order.</p>
    <button id="role-target">Role Target</button>
    <button id="text-target">Text Target</button>
    <button id="css-target">CSS Target</button>
    <div id="status"></div>
    <script>
      let progress = 0;
      const status = document.getElementById('status');
      document.getElementById('role-target').addEventListener('click', () => {
        progress = 1;
        status.textContent = 'role';
      });
      document.getElementById('text-target').addEventListener('click', () => {
        if (progress === 1) {
          progress = 2;
          status.textContent = 'text';
        }
      });
      document.getElementById('css-target').addEventListener('click', () => {
        if (progress === 2) {
          document.body.dataset.level = 'done';
          status.textContent = 'advanced';
        }
      });
    </script>
    `,
    ),
  );
});

app.get('/level/10', async (_request, reply) => {
  reply.type('text/html');
  return reply.send(
    pageShell(
      '10',
      `
    <h1>Level 10</h1>
    <p>Click the target using coordinates.</p>
    <button data-testid="coord-target" id="coord-target" style="position: absolute; left: 40px; top: 40px; width: 140px; height: 40px;">
      Coord Target
    </button>
    <div id="status"></div>
    <script>
      document.getElementById('coord-target').addEventListener('click', () => {
        document.body.dataset.level = 'done';
        document.getElementById('status').textContent = 'advanced';
      });
    </script>
    `,
    ),
  );
});

app.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

async function shutdown() {
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
