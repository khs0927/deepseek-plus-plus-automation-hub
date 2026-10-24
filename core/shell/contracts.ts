import type { ToolRiskLevel } from '../tool/types';

export const SHELL_MCP_SERVER_NAME = 'Shell Local';
export const SHELL_MCP_NATIVE_HOST = 'com.deepseek_pp.shell';

export const OFFICECLI_BIN_PATH = 'officecli';

export const SHELL_TOOL_NAMES = [
  'shell_exec',
  'shell_batch',
  'process_batch',
  'shell_status',
  'python_status',
  'python_exec',
  'local_skill_preview',
  'local_folder_pick',
  'local_file_stat',
  'local_file_read',
  'local_file_write',
  'shell_session_begin',
  'shell_session_exec',
  'shell_session_end',
  'local_dir_list',
  'local_file_search',
  'task_spawn',
  'task_status',
  'task_kill',
  'task_list',
] as const;
export type ShellToolName = typeof SHELL_TOOL_NAMES[number];

export interface ShellToolSpec {
  name: ShellToolName;
  title: string;
  description: string;
  risk: ToolRiskLevel;
}

export const SHELL_TOOL_SPECS: readonly ShellToolSpec[] = [
  {
    name: 'shell_exec',
    title: '执行命令',
    description: '在本地系统执行 shell 命令，返回 stdout、stderr 和退出码。',
    risk: 'high',
  },
  {
    name: 'shell_batch',
    title: '批量执行 Shell 命令',
    description: '单次调用批量执行最多 12 个本地命令。默认按顺序运行；独立命令可并行执行（最多 4 个）。',
    risk: 'high',
  },
  {
    name: 'process_batch',
    title: '直接 실행 파일 일괄 실행',
    description: '셸을 거치지 않고 파일/인수를 분리해 실행합니다. 한 번에 최대 12개, 독립 작업 4개 병렬.',
    risk: 'high',
  },
  {
    name: 'shell_status',
    title: '主机状态',
    description: '报告 Native Host 健康状态、平台、shell 类型和工作目录。',
    risk: 'low',
  },
  {
    name: 'python_status',
    title: 'Python 状态',
    description: '报告本机 Python 解释器、版本和可导入的快速验证库。',
    risk: 'low',
  },
  {
    name: 'python_exec',
    title: '执行 Python',
    description: '执行短 Python 代码，用于快速验证想法、复杂计算和小型数据处理。',
    risk: 'high',
  },
  {
    name: 'local_skill_preview',
    title: '预览本地 Skill',
    description: '只读扫描本地 Skill 目录，返回 SKILL.md、文本资源和脚本清单；不会执行本地代码。',
    risk: 'medium',
  },
  {
    name: 'local_folder_pick',
    title: '选择本地文件夹',
    description: '打开系统文件夹选择器并返回用户选择的本地绝对路径。',
    risk: 'low',
  },
  {
    name: 'local_file_stat',
    title: '查看本地文件信息',
    description: '返回本地文件是否存在、大小、类型和修改时间；不读取文件正文。',
    risk: 'medium',
  },
  {
    name: 'local_file_read',
    title: '读取本地文本文件',
    description: '按字符窗口读取本地 UTF-8 文本文件，支持分片读取大型文件。',
    risk: 'medium',
  },
  {
    name: 'local_file_write',
    title: '写入本地文本文件',
    description: '将 UTF-8 文本原样写入本地文件，支持覆盖或追加，并可自动创建父目录。',
    risk: 'high',
  },
  {
    name: 'shell_session_begin',
    title: '开启持久 Shell 会话',
    description: '启动一个长生存的 Shell 会话，其工作目录、环境变量与常驻子进程（例如 OfficeCLI 驻留模式）可在后续多次 shell_session_exec 之间保持。适用于多步骤工作流，避免分次 shell_exec 丢失状态。返回 session_id 供后续调用使用。',
    risk: 'high',
  },
  {
    name: 'shell_session_exec',
    title: '在持久会话中执行命令',
    description: '在先前开启的持久 Shell 会话中执行命令。状态（工作目录、export 的变量、常驻进程）在调用之间保持。返回与 shell_exec 一致的 stdout、stderr 和退出码。会话闲置一段时间后会自动关闭。',
    risk: 'high',
  },
  {
    name: 'shell_session_end',
    title: '关闭持久 Shell 会话',
    description: '关闭由 shell_session_begin 开启的持久 Shell 会话并释放其子进程。调用后该 session_id 不再有效。',
    risk: 'medium',
  },
  {
    name: 'local_dir_list',
    title: '列出本地目录内容',
    description: '无需启动 shell 快速列出本地目录的文件与子文件夹，返回结构化 JSON。',
    risk: 'low',
  },
  {
    name: 'local_file_search',
    title: '搜索本地文件',
    description: '无需启动 shell 快速按文件名或内容正则表达式搜索目录下的文件。',
    risk: 'low',
  },
  {
    name: 'task_spawn',
    title: '启动后台任务',
    description: '在后台异步启动长期运行的命令（开发服务器、编译、守护进程等），不阻塞 shell。返回 task_id。',
    risk: 'high',
  },
  {
    name: 'task_status',
    title: '查看后台任务状态',
    description: '查看后台任务的运行状态、退出码及增量标准输出/错误日志。',
    risk: 'low',
  },
  {
    name: 'task_kill',
    title: '终止后台任务',
    description: '强制终止后台任务及其整个子进程树。',
    risk: 'medium',
  },
  {
    name: 'task_list',
    title: '列出所有后台任务',
    description: '列出当前所有正在运行或已完成的后台任务。',
    risk: 'low',
  },
] as const;
