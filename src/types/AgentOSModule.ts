import { NativeModules } from 'react-native';

export interface AgentOSResponse {
  status: string;
  message: string;
  queryText?: string;
  pageId?: string;
  actionName?: string;
  displayName?: string;
  desc?: string;
  parametersCount?: number;
}

export interface ActionParameter {
  name: string;
  type: 'STRING' | 'ENUM';
  desc: string;
  required: boolean;
  enumValues?: string[];
}

export interface ActionConfig {
  name: string;
  displayName: string;
  desc: string;
  parameters?: ActionParameter[];
}

export interface ActionExecutionData {
  actionName: string;
  displayName: string;
  desc: string;
  sid: string;
  userQuery: string;
  parameters: { [key: string]: any };
}

export interface IAgentOSModule {
  /**
   * 通过文本形式的用户问题触发大模型规划Action
   * @param text 用户问题的文本，如："今天天气怎么样？"
   */
  query(text: string): Promise<AgentOSResponse>;

  /**
   * 上传页面信息，方便大模型理解当前页面的内容
   * @param interfaceInfo 页面信息描述，最好带有页面组件的层次结构，但内容不宜过长
   */
  uploadInterfaceInfo(interfaceInfo: string): Promise<AgentOSResponse>;

  /**
   * 清空大模型对话上下文记录
   */
  clearContext(): Promise<AgentOSResponse>;

  // =============== PageAgent 相关方法 ===============

  /**
   * 创建PageAgent实例
   * @param pageId 页面唯一标识符
   */
  createPageAgent(pageId: string): Promise<AgentOSResponse>;

  /**
   * 设置PageAgent的角色人设
   * @param pageId 页面唯一标识符
   * @param persona 角色人设描述
   */
  setPersona(pageId: string, persona: string): Promise<AgentOSResponse>;

  /**
   * 设置PageAgent的任务目标
   * @param pageId 页面唯一标识符
   * @param objective 任务目标描述
   */
  setObjective(pageId: string, objective: string): Promise<AgentOSResponse>;

  /**
   * 为PageAgent注册Action
   * @param pageId 页面唯一标识符
   * @param actionName Action名称
   */
  registerAction(pageId: string, actionName: string): Promise<AgentOSResponse>;

  /**
   * 开始PageAgent（激活页面级Agent）
   * @param pageId 页面唯一标识符
   */
  beginPageAgent(pageId: string): Promise<AgentOSResponse>;

  /**
   * 结束PageAgent（停用页面级Agent）
   * @param pageId 页面唯一标识符
   */
  endPageAgent(pageId: string): Promise<AgentOSResponse>;

  /**
   * 获取PageAgent信息
   * @param pageId 页面唯一标识符
   */
  getPageAgentInfo(pageId: string): Promise<AgentOSResponse>;

  /**
   * 注册复杂Action（支持自定义参数和执行器）
   * @param pageId 页面唯一标识符
   * @param actionConfig Action配置对象
   */
  registerComplexAction(pageId: string, actionConfig: ActionConfig): Promise<AgentOSResponse>;

  /**
   * 响应Action执行结果（ActionExecutor返回值）
   * @param actionSid Action的执行ID
   * @param success 是否处理此Action
   */
  respondToActionExecution(actionSid: string, success: boolean): Promise<AgentOSResponse>;

  /**
   * 通知Action执行完成（调用action.notify()）
   * @param actionSid Action的执行ID
   * @param success 业务执行是否成功
   */
  notifyActionComplete(actionSid: string, success: boolean): Promise<AgentOSResponse>;
}

export const AgentOSModule: IAgentOSModule = NativeModules.AgentOSModule; 