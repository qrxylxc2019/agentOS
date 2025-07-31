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

export interface RobotLocalizationResponse {
  status: string;
  message: string;
  result?: number;
  isLocalized: boolean;
  description: string;
}

export interface PlaceDetail {
  name: string;
  x: number;
  y: number;
  theta: number;
}

export interface PlaceListResponse {
  status: string;
  message: string;
  result?: number;
  totalCount?: number;
  filteredCount?: number;
  placeNames: string[];
  placeDetails: PlaceDetail[];
}

export interface NavigationResponse {
  status: string;
  message: string;
  destination: string;
  navigationStarted: boolean;
  description: string;
  errorCode?: number;
  errorString?: string;
  errorType?: string;
  errorStatus?: number;
}

export interface NavigationStatusUpdate {
  statusCode: number;
  statusData: string;
  destination: string;
  statusType: string;
  message: string;
  description: string;
}

export interface NavigationCallback {
  onSuccess: () => void;
  onError: (errorCode: number, errorMessage: string) => void;
  onStatusUpdate: (status: number, data: string) => void;
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

  /**
   * 检查机器人是否已定位
   * @returns Promise<RobotLocalizationResponse> 定位状态检查结果
   */
  checkRobotLocalization(): Promise<RobotLocalizationResponse>;

  /**
   * 启动机器人定位（重定位）
   * @returns Promise<AgentOSResponse> 启动定位的结果
   */
  startRobotReposition(): Promise<AgentOSResponse>;

  /**
   * 获取地图点位列表
   * @returns Promise<PlaceListResponse> 点位列表数据
   */
  getPlaceList(): Promise<PlaceListResponse>;

  /**
   * 开始导航到指定地点
   * @param destName 目标地点名称
   * @returns Promise<NavigationResponse> 导航启动结果
   */
  startNavigation(destName: string): Promise<NavigationResponse>;

  /**
   * 开始导航到指定地点（带回调）
   * @param destName 目标地点名称
   * @param callback 导航回调函数
   * @returns Promise<NavigationResponse> 导航启动结果
   */
  startNavigationWithCallback(destName: string, callback: NavigationCallback): Promise<NavigationResponse>;
}

export const AgentOSModule: IAgentOSModule = NativeModules.AgentOSModule; 