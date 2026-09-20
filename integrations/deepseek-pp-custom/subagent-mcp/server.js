const http = require('http');
const { SubagentOrchestrator } = require('./orchestrator');
const { SessionKeeper } = require('./session-keeper');
const { WatchdogDaemon } = require('./watchdog-daemon');

const orchestrator = new SubagentOrchestrator();
const sessionKeeper = new SessionKeeper({ cdpUrl: orchestrator.config.cdpUrl || 'http://127.0.0.1:9223' });
const watchdog = new WatchdogDaemon({
  cdpUrl: orchestrator.config.cdpUrl || 'http://127.0.0.1:9223',
  intervalMs: 10000,
  autoWake: true
});

// Auto-start watchdog in background
watchdog.start();

const PORT = orchestrator.config.port || 8932;

const TOOLS = [
  // 1. Subagent Orchestration Tools
  {
    name: 'invoke_subagent',
    description: '독립적인 서브에이전트(Subagent)를 스폰하여 복잡하거나 병렬 처리가 필요한 작업을 위임합니다. 서브에이전트는 자체 추론 루프를 통해 분석, 코드 작성, 리서치 등을 자율적으로 수행하고 결과 보고서를 반환합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: "서브에이전트의 구체적 역할 (예: '코드 보안 감사관', '문서 리서처', '데이터 분석가', '테스트 엔지니어')"
        },
        task: {
          type: 'string',
          description: '서브에이전트에게 위임할 상세 작업 지시사항, 제약조건, 기대하는 출력 형식'
        },
        engine: {
          type: 'string',
          enum: ['auto', 'deepseek_web', 'gemini', 'groq'],
          description: "추론 엔진 선택. 기본값 'auto'는 무료 API 키 유무에 따라 자동 선택되며, 키가 없어도 브라우저 DeepSeek 세션(100% 무료)으로 구동됩니다."
        },
        background: {
          type: 'boolean',
          description: '백그라운드 비동기 실행 여부. false(기본값)는 완료 시까지 대기 후 결과 즉시 반환, true는 task_id를 즉시 반환.'
        }
      },
      required: ['role', 'task']
    }
  },
  {
    name: 'invoke_subagent_batch',
    description: '여러 독립 서브에이전트를 하나의 호출로 등록하고 bounded parallel fan-out으로 실행합니다. 실제 동시 실행 수는 maxConcurrentSubagents 정책을 따르며 초과 작업은 QUEUED 상태로 대기합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', description: '서브에이전트 역할' },
              task: { type: 'string', description: '독립 하위 작업 지시사항' },
              engine: {
                type: 'string',
                enum: ['auto', 'deepseek_web', 'gemini', 'groq'],
                description: '엔진 선택. 기본 auto.'
              }
            },
            required: ['role', 'task'],
            additionalProperties: false
          }
        },
        background: {
          type: 'boolean',
          description: 'true면 task_id 목록을 즉시 반환하고, false면 모든 작업이 terminal 상태가 될 때까지 기다립니다.'
        }
      },
      required: ['tasks'],
      additionalProperties: false
    }
  },
  {
    name: 'check_subagent_status',
    description: '스폰된 서브에이전트의 현재 진행 상태(RUNNING, COMPLETED, FAILED) 및 작업 결과물을 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'invoke_subagent 호출 시 반환받은 task_id'
        }
      },
      required: ['task_id']
    }
  },
  {
    name: 'list_subagents',
    description: '현재 세션에서 스폰된 모든 서브에이전트의 상태와 작업 요약 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'kill_subagent',
    description: '실행 중인 서브에이전트를 강제 중단(Cancel)합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: '취소할 서브에이전트의 task_id'
        }
      },
      required: ['task_id']
    }
  },
  {
    name: 'set_subagent_config',
    description: '서브에이전트 구동 설정(무료 Gemini API Key, Groq API Key, 기본 엔진 등)을 저장합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        geminiApiKey: { type: 'string', description: 'Google AI Studio 무료 API Key' },
        groqApiKey: { type: 'string', description: 'Groq Cloud 무료 API Key' },
        defaultEngine: { type: 'string', enum: ['auto', 'deepseek_web', 'gemini', 'groq'] },
        maxConcurrentSubagents: {
          type: 'integer',
          minimum: 1,
          maximum: 16,
          description: '동시에 실제 실행할 서브에이전트 상한. 초과 작업은 QUEUED.'
        }
      }
    }
  },

  // 2. Session Watchdog & Auto-Wakeup Tools
  {
    name: 'list_deepseek_sessions',
    description: '현재 브라우저에 열려 있는 모든 DeepSeek 대화 세션의 실시간 상태(정상 진행, 멈춤, 계속 버튼 대기, 도구 실패 등)를 스캔하여 요약합니다.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_session_logs',
    description: '특정 대화 세션(또는 현재 활성 탭)의 상세 실행 로그 및 단계별 도구 실패/성공 이력을 조회합니다. 작업이 멈췄거나 오류가 발생한 원인을 정밀 진단할 때 사용합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: "조회할 DeepSeek 세션 ID (예: 'f0971d0b-3698-4c6b-9ac6-fe8a5e6145f4'). 생략하거나 'current' 입력 시 현재 열린 세션 조회."
        }
      }
    }
  },
  {
    name: 'wake_up_session',
    description: '멈춰있거나 일시 중단된 대화 세션을 즉시 깨웁니다. 화면의 재시도/계속 버튼을 자동 클릭하거나, 문맥에 맞춘 계속 진행 명령어를 주입하여 작업을 재개합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: "깨울 대화 세션 ID (생략 시 현재 열려 있는 DeepSeek 탭 자동 대상)."
        },
        custom_message: {
          type: 'string',
          description: "주입할 사용자 지정 지시문 (예: '계속', '도구 오류를 무시하고 다음 단계 코드를 작성해주세요'). 미지정 시 최적화된 복구 프롬프트 자동 사용."
        },
        force_prompt: {
          type: 'boolean',
          description: "버튼 클릭 대신 무조건 입력창에 프롬프트를 주입하여 전송할지 여부 (기본값 false)."
        }
      }
    }
  },
  {
    name: 'configure_watchdog',
    description: '백그라운드 자동 감시(Watchdog) 데몬의 동작 설정(자동 깨우기 on/off, 감시 주기) 및 현재 가동 통계를 조회하거나 변경합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        auto_wake: {
          type: 'boolean',
          description: '멈춤 감지 시 자동으로 깨우기(계속 입력/버튼 클릭)를 수행할지 여부 (기본 true).'
        },
        interval_seconds: {
          type: 'number',
          description: '세션 상태 검사 주기(초 단위, 최소 3초, 기본 10초).'
        }
      }
    }
  }
];

let sseClients = new Set();

function broadcastSse(messageObj) {
  const payload = JSON.stringify(messageObj);
  console.log('[SSE OUT]:', payload.slice(0, 150));
  for (const client of sseClients) {
    client.write(`event: message\ndata: ${payload}\n\n`);
  }
}

async function handleJsonRpc(reqBody) {
  const { id, method, params } = reqBody;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'Subagent Manager & Session Watchdog (DeepSeek++)',
          version: '1.2.0'
        },
        instructions: 'Subagent Manager & Session Watchdog provides autonomous subagent orchestration, live session stall detection, execution trace logs, and automated wake-up recovery for DeepSeek++.'
      }
    };
  }

  if (method === 'notifications/initialized') {
    return null; // Notification, no response required
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS
      }
    };
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      let toolResult;

      // Subagent tools
      if (toolName === 'invoke_subagent') {
        const res = await orchestrator.invokeSubagent(args);
        if (args.background) {
          toolResult = `[서브에이전트 비동기 스폰 완료]\n- Task ID: ${res.taskId}\n- 역할: ${res.role}\n- 엔진: ${res.engine}\n- 상태: ${res.status}\n\n진행 상황은 check_subagent_status(task_id="${res.taskId}")로 확인할 수 있습니다.`;
        } else {
          toolResult = [
            `### 🤖 서브에이전트 [${res.role}] 실행 완료 보고`,
            `- **Task ID**: \`${res.id}\``,
            `- **엔진**: ${res.resolvedEngine || res.engine}`,
            `- **완료 시각**: ${res.endTime}`,
            ``,
            `#### 📋 수행 결과:`,
            res.result
          ].join('\n');
        }
      } else if (toolName === 'invoke_subagent_batch') {
        const res = await orchestrator.invokeSubagentBatch(args);
        if (res.background) {
          toolResult = [
            '### 🤖 서브에이전트 병렬 배치 등록 완료',
            `- **Task 수**: ${res.taskIds.length}`,
            `- **동시 실행 상한**: ${res.stats.maxConcurrent}`,
            `- **현재 실행/대기**: ${res.stats.active} / ${res.stats.queued}`,
            '',
            ...res.tasks.map((task) => `- [${task.status}] \`${task.taskId}\` | ${task.role} | ${task.engine}`)
          ].join('\n');
        } else {
          toolResult = [
            '### 🤖 서브에이전트 병렬 배치 완료',
            `- **Task 수**: ${res.taskIds.length}`,
            '',
            ...res.tasks.map((task) => [
              `#### [${task.status}] ${task.role}`,
              `- ID: \`${task.id}\``,
              `- Engine: ${task.resolvedEngine || task.engine}`,
              task.result ? `- Result:\n${task.result}` : `- Error: ${task.error || '없음'}`
            ].join('\n'))
          ].join('\n\n');
        }
      } else if (toolName === 'check_subagent_status') {
        const record = orchestrator.checkStatus(args.task_id);
        if (record.error) {
          toolResult = `❌ 오류: ${record.error}`;
        } else {
          toolResult = [
            `### 서브에이전트 상태: [${record.role}]`,
            `- **ID**: ${record.id}`,
            `- **상태**: ${record.status}`,
            record.queuePosition ? `- **대기 순번**: ${record.queuePosition}` : '',
            `- **엔진**: ${record.engine}`,
            `- **시작**: ${record.startTime}`,
            `- **종료**: ${record.endTime || '진행 중...'}`,
            record.result ? `\n#### 결과:\n${record.result}` : (record.error ? `\n#### 에러:\n${record.error}` : '')
          ].join('\n');
        }
      } else if (toolName === 'list_subagents') {
        const list = orchestrator.listSubagents();
        if (list.length === 0) {
          toolResult = '현재 실행되었거나 대기 중인 서브에이전트가 없습니다.';
        } else {
          toolResult = '### 📋 서브에이전트 목록:\n' + list.map(t => 
            `- **[${t.status}]** \`${t.id}\` | 역할: ${t.role} (${t.engine}) | 요약: ${t.summary || '없음'}`
          ).join('\n');
        }
      } else if (toolName === 'kill_subagent') {
        const res = orchestrator.killSubagent(args.task_id);
        toolResult = res.message;
      } else if (toolName === 'set_subagent_config') {
        const updated = orchestrator.saveConfig(args);
        toolResult = `설정이 저장되었습니다: ${JSON.stringify(updated, null, 2)}`;
      }

      // Session Watchdog & Logger tools
      else if (toolName === 'list_deepseek_sessions') {
        const sessions = await sessionKeeper.scanSessions();
        if (sessions.length === 0) {
          toolResult = '열려 있는 DeepSeek 대화 세션이 없습니다. Edge 브라우저에서 https://chat.deepseek.com 이 열려 있는지 확인하세요.';
        } else {
          const lines = ['### 🌐 활성 DeepSeek 대화 세션 목록:'];
          for (const s of sessions) {
            const statusIcon = s.status === 'GENERATING' ? '🟡 생성 중' :
                               s.status === 'NEEDS_RESUME_BUTTON' ? '🟠 계속 대기' :
                               s.status === 'STALLED' || s.status === 'TOOL_FAILURE_STALLED' ? '🔴 멈춤/오류' :
                               s.status === 'AGENT_ERROR' ? '❌ 에러' : '🟢 대기 중';
            lines.push(`\n#### [${statusIcon}] **${s.title}**`);
            lines.push(`- **Session ID**: \`${s.sessionId}\``);
            lines.push(`- **상태 코드**: \`${s.status}\``);
            if (s.dppPhase) lines.push(`- **에이전트 단계**: ${s.dppPhase} (${s.dppStatusText || ''})`);
            if (s.failedToolCount > 0) lines.push(`- **실패 도구**: ${s.failedToolCount}건 (${(s.failedToolsSnippet || []).join(', ')})`);
            if (s.hasResumeBtn) lines.push(`- **감지된 버튼**: '${s.resumeBtnText}'`);
            if (s.wakeInfo && s.wakeInfo.wakeCount > 0) lines.push(`- **깨우기 이력**: ${s.wakeInfo.wakeCount}회 수행됨`);
            if (s.lastTextSnippet) lines.push(`- **최근 텍스트 요약**: ${s.lastTextSnippet.slice(-120).replace(/\n/g, ' ')}`);
            if (s.error) lines.push(`- **오류**: ${s.error}`);
          }
          toolResult = lines.join('\n');
        }
      } else if (toolName === 'get_session_logs') {
        const detailed = await sessionKeeper.getDetailedSessionLogs(args.session_id);
        const lines = [`### 📜 DeepSeek 세션 상세 실행 및 오류 로그`];
        lines.push(`- **조회 시각**: ${new Date(detailed.timestamp).toLocaleString('ko-KR')}`);

        if (detailed.liveSessions.length > 0) {
          lines.push(`\n#### 🖥️ 실시간 탭 상태:`);
          for (const s of detailed.liveSessions) {
            lines.push(`- **제목**: ${s.title} (\`${s.sessionId}\`)`);
            lines.push(`- **상태**: \`${s.status}\` | 생성 중: ${s.isGenerating} | 에이전트 단계: ${s.dppPhase || 'N/A'}`);
            if (s.lastTextSnippet) {
              lines.push(`- **마지막 출력 스니펫**:\n  > ${s.lastTextSnippet.slice(-200).replace(/\n/g, '\n  > ')}`);
            }
          }
        }

        if (detailed.recentTraces.length > 0) {
          lines.push(`\n#### 🔍 DeepSeek++ 확장 프로그램 실행 트레이스 (최근 ${detailed.recentTraces.length}건):`);
          for (const t of detailed.recentTraces.slice(0, 3)) {
            lines.push(`\n##### 🔹 Trace [${t.status.toUpperCase()}] (\`${t.chatSessionId}\` / ${t.createdAt})`);
            lines.push(`- **총 단계 / 도구**: ${t.totalSteps}단계, ${t.totalTools}회 도구 호출 (${t.durationSeconds}초 소요)`);
            if (t.error) lines.push(`- **❗ 에러 원인**: \`${t.error}\``);

            for (const s of t.steps) {
              lines.push(`  - **Step ${s.stepIndex + 1}** [${s.status}]:`);
              if (s.textSnippet) lines.push(`    - 설명: ${s.textSnippet.slice(0, 100).replace(/\n/g, ' ')}...`);
              for (const tool of s.toolExecutions) {
                const icon = tool.ok ? '✅' : '❌';
                lines.push(`    - ${icon} 도구 \`${tool.name}\`: ${tool.summary || '결과 없음'}${tool.error ? ` (${tool.error})` : ''}`);
              }
            }
          }
        } else {
          lines.push('\n- 기록된 에이전트 트레이스 로그가 없습니다.');
        }

        toolResult = lines.join('\n');
      } else if (toolName === 'wake_up_session') {
        const res = await sessionKeeper.wakeUpSession({
          sessionId: args.session_id,
          customMessage: args.custom_message,
          forcePrompt: args.force_prompt
        });
        toolResult = res.message;
      } else if (toolName === 'configure_watchdog') {
        let status;
        if (args.auto_wake !== undefined || args.interval_seconds !== undefined) {
          status = watchdog.configure({
            autoWake: args.auto_wake,
            intervalMs: args.interval_seconds ? args.interval_seconds * 1000 : undefined
          });
        } else {
          status = watchdog.getStatus();
        }
        toolResult = [
          `### 🐕 Watchdog 상시 감시 상태`,
          `- **동작 여부**: ${status.isRunning ? '🟢 실행 중 (RUNNING)' : '🔴 중지됨 (STOPPED)'}`,
          `- **자동 깨우기(Auto-Wake)**: ${status.autoWake ? '활성화 (ON)' : '비활성화 (OFF)'}`,
          `- **감시 주기**: ${status.intervalMs / 1000}초`,
          `- **최근 확인 시각**: ${status.lastCheckTime ? new Date(status.lastCheckTime).toLocaleString('ko-KR') : '없음'}`,
          `- **누적 통계**: 총 검사 ${status.stats.checksTotal}회 | 멈춤 감지 ${status.stats.stallsDetected}회 | 깨우기 시도 ${status.stats.wakesAttempted}회 | 성공 ${status.stats.wakesSucceeded}회`
        ].join('\n');
      } else {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: toolResult
            }
          ]
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: `도구 실행 중 에러 발생: ${err.message}`
            }
          ]
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method '${method}' not found`
    }
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const proto = host.includes('trycloudflare.com') ? 'https' : 'http';
  const url = new URL(req.url, `${proto}://${host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    const stats = orchestrator.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'deepseek-subagent-manager',
      port: PORT,
      engines: ['auto', 'deepseek_web', 'gemini', 'groq'],
      availability: orchestrator.getEngineAvailability(),
      stats
    }));
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/sse' || url.pathname === '/')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const postEndpoint = `${proto}://${host}/message`;
    console.log('[SSE] Client connected, advertising endpoint:', postEndpoint);
    res.write(`event: endpoint\ndata: ${postEndpoint}\n\n`);

    sseClients.add(res);
    res.on('error', (err) => {
      sseClients.delete(res);
      console.log('[SSE] Client error, removed:', err.message);
    });
    req.on('close', () => {
      sseClients.delete(res);
      console.log('[SSE] Client disconnected');
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/message') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      console.log('[POST message]:', body.slice(0, 150));
      try {
        const jsonRpcReq = JSON.parse(body);
        const jsonRpcRes = await handleJsonRpc(jsonRpcReq);

        if (jsonRpcRes) {
          // Broadcast to SSE streams
          broadcastSse(jsonRpcRes);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(jsonRpcRes || { ok: true }));
      } catch (err) {
        console.error('Error handling JSON-RPC:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Subagent Manager & Session Watchdog listening on http://127.0.0.1:${PORT}`);
  console.log(`SSE Endpoint: http://127.0.0.1:${PORT}/sse`);
});

