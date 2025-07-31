import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  TouchableOpacity,
  NativeModules,
  DeviceEventEmitter,
  Image,
  ScrollView,
} from 'react-native';
import { ChatMessage, AgentOSModule, ActionConfig, ActionExecutionData } from '../types';

function ChatScreen(): React.JSX.Element {
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    // 测试原生模块是否可用
    console.log('=== ChatScreen useEffect ===');
    console.log('Available NativeModules:', Object.keys(NativeModules));
    console.log('AgentOSModule exists:', !!NativeModules.AgentOSModule);
    console.log('AgentOSModule methods:', NativeModules.AgentOSModule ? Object.keys(NativeModules.AgentOSModule) : 'undefined');

    // 初始化PageAgent
    const initializePageAgent = async () => {
      try {
        if (NativeModules.AgentOSModule) {
          const pageId = 'ChatScreen';

          // 1. 清理AgentOS上下文
          await NativeModules.AgentOSModule.clearContext();
          console.log('AgentOS context cleared');

          // 2. 创建PageAgent
          const createResult = await NativeModules.AgentOSModule.createPageAgent(pageId);
          console.log('PageAgent created:', createResult);

          // 3. 设置角色人设
          const personaResult = await NativeModules.AgentOSModule.setPersona(
            pageId,
            '你是猎户风景区的智能导游助手，熟悉景区的各种设施、门票价格、参观路线和景点介绍。你热情友好，能够为游客提供专业的咨询服务和引导。'
          );
          console.log('Persona set:', personaResult);

          // 4. 设置任务目标
          const objectiveResult = await NativeModules.AgentOSModule.setObjective(
            pageId,
            '为游客提供景区信息咨询，包括门票购买、景点介绍、游览路线推荐、设施位置等，提升游客的参观体验。'
          );
          console.log('Objective set:', objectiveResult);

          // 5. 注册Actions（注册SAY Action用于语音回复）
          const actionResult = await NativeModules.AgentOSModule.registerAction(pageId, 'orion.agent.action.SAY');
          console.log('Action registered:', actionResult);

          // 6. 注册复杂Action - "引领"功能
          const leadingActionConfig: ActionConfig = {
            name: 'com.agent.demo.leading',
            displayName: '引领',
            desc: '带用户去指定的地点，为用户提供导航和路径指引服务',
            parameters: [
              {
                name: 'location',
                type: 'STRING',
                desc: '目标地点名称，如：会议室、大厅、接待台、办公室等',
                required: true
              }
            ]
          };

          const leadingResult = await NativeModules.AgentOSModule.registerComplexAction(pageId, leadingActionConfig);
          console.log('Leading action registered:', leadingResult);

          // 7. 开始PageAgent（所有Action注册完毕后）
          const beginResult = await NativeModules.AgentOSModule.beginPageAgent(pageId);
          console.log('PageAgent began:', beginResult);

          // 8. 上传页面信息
          const interfaceInfo = `当前页面是社保小助手聊天界面，包含：
          - 消息列表：显示社保咨询对话记录
          - 输入框：用户可以输入社保相关问题
          - 语音按钮：用户可以通过语音咨询社保问题
          - 发送按钮：发送社保咨询消息
          
          用户可以咨询的社保问题包括：
          - 社保缴费问题和流程
          - 医保报销政策和流程
          - 养老保险相关问题
          - 工伤保险申请和赔付
          - 失业保险申领
          - 社保卡办理和使用
          - 社保转移接续
          - 退休手续办理等`;

          await NativeModules.AgentOSModule.uploadInterfaceInfo(interfaceInfo);
          console.log('Interface info uploaded');

          console.log('PageAgent initialization completed successfully');

        } else {
          console.error('AgentOSModule not found in NativeModules');
        }
      } catch (error) {
        console.error('Failed to initialize PageAgent:', error);
      }
    };

    initializePageAgent();

    // 监听Action执行事件
    const actionExecutionListener = DeviceEventEmitter.addListener(
      'AgentActionExecuted',
      (data: ActionExecutionData) => {
        console.log('Action executed:', data);
        handleActionExecution(data);
      }
    );

    // 组件卸载时清理PageAgent和事件监听
    // 移除欢迎提示
    return () => {
      const cleanup = async () => {
        try {
          // 移除事件监听
          actionExecutionListener.remove();

          if (NativeModules.AgentOSModule) {
            await NativeModules.AgentOSModule.endPageAgent('ChatScreen');
            console.log('PageAgent ended on component unmount');
          }
        } catch (error) {
          console.error('Failed to end PageAgent:', error);
        }
      };
      cleanup();
    };
  }, []);

  const backgroundStyle = {
    backgroundColor: '#5B6FB1', // 使用图片中的蓝紫色背景
  };

  // 移除 addMessage 函数，因为我们不再使用消息列表

  // 处理Action执行
  const handleActionExecution = async (data: ActionExecutionData) => {
    console.log('=== handleActionExecution called ===');
    console.log('Action data:', data);

    let executionSuccess = false;

    try {
      const { actionName, userQuery, parameters, sid } = data;

      if (actionName === 'com.agent.demo.leading') {
        // 处理引领Action
        const location = parameters.location || '未知地点';

        // 1. 显示Action触发信息
        console.log(`🎯 检测到引领请求！目标地点：${location}，用户问题：${userQuery}，Action ID：${sid}`);

        console.log(`开始引领用户前往：${location}`);

        // 2. 模拟具体的引领场景并显示结果
        if (location.includes('茶水间')) {
          console.log(`导航成功：开始引领前往茶水间`);
          executionSuccess = true;

        } else if (location.includes('咖啡厅')) {
          console.log(`导航失败：咖啡厅暂时关闭`);
          executionSuccess = false;

        } else {
          console.log(`导航成功：开始引领前往 ${location}`);
          executionSuccess = true;
        }

      } else {
        // 处理其他Action
        // addMessage(`✅ 执行了Action: ${displayName}\n用户问题: ${userQuery}\n参数: ${JSON.stringify(parameters)}\nAction ID: ${sid}`, false); // 移除 addMessage
        executionSuccess = true;
      }

      // 1. 首先告诉ActionExecutor我们要处理这个Action
      try {
        const executorResponse = await AgentOSModule.respondToActionExecution(sid, true); // true表示我们处理
        console.log('ActionExecutor response sent:', executorResponse);
      } catch (responseError) {
        console.error('Failed to send ActionExecutor response:', responseError);
      }

      // 2. 执行业务逻辑完成后，调用action.notify()通知状态
      try {
        const notifyResponse = await AgentOSModule.notifyActionComplete(sid, executionSuccess);
        console.log('Action notify response sent:', notifyResponse);

        if (executionSuccess) {
          console.log(`🔔 系统通知：引领任务执行成功，任务ID：${sid}`);
        } else {
          console.log(`🔔 系统通知：引领任务执行失败，任务ID：${sid}`);
        }
      } catch (notifyError) {
        console.error('Failed to notify action completion:', notifyError);
        console.log(`⚠️ 系统通知失败：${notifyError}`);
      }

    } catch (error) {
      console.error('Error handling action execution:', error);
      console.log('❌ 处理Action执行时发生错误');

      // 即使处理出错，也要向原生层报告
      try {
        if (data.sid) {
          // 1. ActionExecutor返回false（不处理）
          await AgentOSModule.respondToActionExecution(data.sid, false);
          // 2. notify失败状态
          await AgentOSModule.notifyActionComplete(data.sid, false);
          console.log('Error responses sent to native layer');
        }
      } catch (responseError) {
        console.error('Failed to send error responses:', responseError);
      }
    }
  };

  const handleSend = async (queryText: string) => {
    try {
      if (NativeModules.AgentOSModule) {
        // 调用AgentOS SDK的query方法
        console.log('Calling NativeModules.AgentOSModule.query with:', queryText);
        const result = await NativeModules.AgentOSModule.query(queryText);
        console.log('AgentOS query result:', result);
      } else {
        console.error('AgentOSModule not available');
      }
    } catch (error) {
      console.error('AgentOS query error:', error);
    }
  };

  const handleQuickButton = (question: string) => {
    console.log(`Quick button pressed: ${question}`);
    handleSend(question);
  };

  const handleVoice = async () => {
    setIsListening(!isListening);
    if (!isListening) {
      try {
        // 上传当前页面信息，帮助AgentOS理解当前页面内容
        const interfaceInfo = `当前页面是猎户风景区欢迎页面，包含：
        - 标题：猎户风景区欢迎你
        - 中央图片：风景区图片
        - 语音提示：你还可以问我
        - 快捷问题按钮：如何进入后台、如何配置首页、优秀首页示例`;

        await AgentOSModule.uploadInterfaceInfo(interfaceInfo);
        console.log('Interface info uploaded successfully');

        // 提示用户语音功能已激活
        console.log('语音功能已激活，请开始说话...');

        // 2秒后关闭语音监听状态
        setTimeout(() => {
          setIsListening(false);
          console.log('语音识别已结束');
        }, 2000);

      } catch (error) {
        console.error('Voice activation error:', error);
        setIsListening(false);
        console.log('语音功能暂时不可用');
      }
    }
  };

  // 移除原来的renderMessage函数，因为我们不再使用FlatList显示消息

  return (
    <SafeAreaView style={[styles.container, backgroundStyle]}>
      {/* 两列布局容器 */}
      <View style={styles.mainContainer}>
        {/* 左侧列 */}
        <View style={styles.leftColumn}>
          {/* 标题栏 */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              政务中心欢迎您！
            </Text>
          </View>

          {/* 中间图片区域 */}
          <View style={styles.imageContainer}>
            <Image
              source={require('../assets/img/demo.gif')}
              style={styles.centerImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* 右侧列 */}
        <View style={styles.rightColumn}>
          {/* 语音提示区域 */}
          <View style={styles.voiceHintContainer}>
            <View style={styles.micIconContainer}>
              <Image
                source={require('../assets/img/demo.gif')}
                style={styles.micIcon}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.voiceHintText}>你还可以问我</Text>
          </View>

          {/* 快捷问题按钮区域 - 垂直滚动 */}
          <ScrollView style={styles.quickButtonsContainer} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickButton('社保卡基本信息查询')}
            >
              <Text style={styles.quickButtonText}>社保卡基本信息查询</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickButton('企业职工人员信息变更业务')}
            >
              <Text style={styles.quickButtonText}>企业职工人员信息变更业务</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickButton('灵活就业人员参保信息查询')}
            >
              <Text style={styles.quickButtonText}>灵活就业人员参保信息查询</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickButton('领取失业金期间按月登记')}
            >
              <Text style={styles.quickButtonText}>领取失业金期间按月登记</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickButton('机关事业单位特殊工种如何办理退休手续？')}
            >
              <Text style={styles.quickButtonText}>机关事业单位特殊工种如何办理退休手续？</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickButton('领取失业金期间按月登记')}
            >
              <Text style={styles.quickButtonText}>领取失业金期间按月登记</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickButton('城乡居民生存认证')}
            >
              <Text style={styles.quickButtonText}>城乡居民生存认证</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickButton('工伤异地居住（就医） 备案')}
            >
              <Text style={styles.quickButtonText}>工伤异地居住（就医） 备案</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  leftColumn: {
    flex: 1,
    paddingRight: 10,
  },
  rightColumn: {
    flex: 1,
    paddingLeft: 10,
    paddingTop: 20,
  },
  header: {
    padding: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 20,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 10,
  },
  centerImage: {
    width: '100%',
    height: '80%',
    borderRadius: 10,
  },
  speechBubble: {
    position: 'absolute',
    top: '15%',
    right: '10%',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 12,
    maxWidth: '50%',
    transform: [{ rotate: '-5deg' }],
  },
  speechText: {
    color: '#5B6FB1',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  voiceHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  micIconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  micIcon: {
    width: 24,
    height: 24,
  },
  voiceHintText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  quickButtonsContainer: {
    flex: 1,
    paddingHorizontal: 10,
  },
  quickButton: {
    backgroundColor: '#8E6BFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 15,
    alignItems: 'center',
  },
  quickButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ChatScreen; 