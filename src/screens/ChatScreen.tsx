import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  NativeModules,
  DeviceEventEmitter,
  Image,
  ScrollView,
} from 'react-native';
import { ChatMessage, AgentOSModule, ActionConfig, ActionExecutionData, RobotLocalizationResponse, PlaceListResponse, NavigationResponse, NavigationStatusUpdate, NavigationCallback } from '../types';

function ChatScreen(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const flatListRef = useRef<FlatList>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: '你好！我是社保小助手，专门为您解答社会保险相关问题。无论是社保缴费、医保报销、养老保险还是其他社保业务，我都可以为您提供专业的咨询和指导。请问有什么社保问题需要我帮助您解决吗？',
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [availablePlaces, setAvailablePlaces] = useState<string[]>([]);
  const currentNavigationActionSid = useRef<string | null>(null);
  const navigationCallbacks = useRef<Map<string, NavigationCallback>>(new Map());

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
            '你是一个专业的社保小助手，熟悉各类社会保险政策和办理流程。你耐心细致，能够用通俗易懂的语言为用户解释复杂的社保问题，帮助用户快速理解各种手续的办理要求。'
          );
          console.log('Persona set:', personaResult);

          // 4. 设置任务目标
          const objectiveResult = await NativeModules.AgentOSModule.setObjective(
            pageId,
            '解决用户办理社保相关手续时遇到的问题，包括但不限于：社保缴费、医保报销、养老保险、工伤保险、失业保险等各类社保业务的咨询和指导。'
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
          // 移除第一次uploadInterfaceInfo调用，避免覆盖问题
          console.log('PageAgent初始化完成，将在获取点位列表后统一上传界面信息');

          console.log('PageAgent initialization completed successfully');

        } else {
          console.error('AgentOSModule not found in NativeModules');
        }
      } catch (error) {
        console.error('Failed to initialize PageAgent:', error);
      }
    };

    // 获取地图点位列表
    const loadPlaceList = async () => {
      try {
        console.log('开始获取地图点位列表...');
        const placeListResult = await AgentOSModule.getPlaceList();
        console.log('点位列表获取结果:', placeListResult);

        if (placeListResult.status === 'success') {
          setAvailablePlaces(placeListResult.placeNames);
          console.log('可用点位列表:', placeListResult.placeNames);

          // 显示点位加载成功的消息
          if (placeListResult.placeNames.length > 0) {
            const placeMessage = `📍 地图点位信息已加载
            
🗺️ 当前地图共有 ${placeListResult.filteredCount} 个可导航点位
📋 可用地点包括：
${placeListResult.placeNames.slice(0, 10).map(place => `• ${place}`).join('\n')}
${placeListResult.placeNames.length > 10 ? `\n... 还有 ${placeListResult.placeNames.length - 10} 个地点` : ''}

💡 您可以说："带我去 [地点名称]" 来使用引领功能`;

            addMessage(placeMessage, false);

            // 统一上传界面信息，只包含导航相关内容
            try {
              const interfaceInfo = `当前页面支持引领导航功能，机器人可以引领用户前往以下地点：

🗺️ 可导航地点列表：
${placeListResult.placeNames.map(place => `• ${place}`).join('\n')}

💡 用户可以说"带我去 [地点名称]"来使用引领功能，机器人会自动检查定位状态并引领用户前往目标地点。`;

              await AgentOSModule.uploadInterfaceInfo(interfaceInfo);
              console.log('导航界面信息上传成功');
            } catch (uploadError) {
              console.error('上传界面信息失败:', uploadError);
            }
          }
        } else {
          console.error('获取点位列表失败:', placeListResult.message);
          setAvailablePlaces([]);
        }
      } catch (error) {
        console.error('获取点位列表时发生错误:', error);
        setAvailablePlaces([]);
      }
    };

    initializePageAgent();

    // 延迟获取点位列表，确保PageAgent初始化完成
    setTimeout(() => {
      loadPlaceList();
    }, 2000);

    // 监听Action执行事件
    const actionExecutionListener = DeviceEventEmitter.addListener(
      'AgentActionExecuted',
      (data: ActionExecutionData) => {
        console.log('Action executed:', data);
        handleActionExecution(data);
      }
    );

    // 监听导航状态事件
    const navigationSuccessListener = DeviceEventEmitter.addListener(
      'NavigationSuccess',
      async (data: NavigationResponse) => {
        console.log('Navigation Success:', data);
        const successMessage = `🎉 导航完成成功！
        
✅ 机器人已成功到达"${data.destination}"
📍 任务状态：已完成
🎯 引领服务圆满结束`;
        addMessage(successMessage, false);

        // 检查是否有注册的回调
        const currentSid = currentNavigationActionSid.current;
        console.log(`NavigationSuccess事件触发，currentNavigationActionSid: ${currentSid}`);
        console.log(`当前回调映射keys: ${Array.from(navigationCallbacks.current.keys()).join(', ')}`);
        console.log(`当前回调映射大小: ${navigationCallbacks.current.size}`);
        if (currentSid && navigationCallbacks.current.has(currentSid)) {
          const callback = navigationCallbacks.current.get(currentSid);
          if (callback) {
            console.log('调用导航成功回调');
            callback.onSuccess();
            navigationCallbacks.current.delete(currentSid);
            console.log(`NavigationSuccess: 清空currentNavigationActionSid，之前的值: ${currentSid}`);
            currentNavigationActionSid.current = null;
          }
        } else {
          console.log('NavigationSuccess事件触发，但没有找到对应的回调');
        }
      }
    );

    const navigationErrorListener = DeviceEventEmitter.addListener(
      'NavigationError',
      async (data: NavigationResponse) => {
        console.log('Navigation Error:', data);
        let errorMessage = `❌ 导航失败！
        
🎯 目标地点：${data.destination}
🚫 失败原因：${data.message}
📋 详细说明：${data.description}`;

        // 根据错误类型提供特定的解决方案
        if (data.errorType === 'NOT_LOCALIZED') {
          errorMessage += `\n\n🔄 自动解决方案：正在启动机器人定位...`;
          // 自动启动定位
          handleAutoReposition();
        } else if (data.errorType === 'DESTINATION_NOT_EXIST') {
          errorMessage += `\n\n💡 建议：请检查地点名称是否正确，或查看可用地点列表`;
        } else if (data.errorType === 'ALREADY_AT_DESTINATION') {
          errorMessage += `\n\n🎉 好消息：机器人已经在目标地点了！`;
        }

        addMessage(errorMessage, false);

        // 检查是否有注册的回调
        const currentSid = currentNavigationActionSid.current;
        if (currentSid && navigationCallbacks.current.has(currentSid)) {
          const callback = navigationCallbacks.current.get(currentSid);
          if (callback) {
            console.log('调用导航失败回调');
            callback.onError(data.errorCode || -1, data.message || 'Unknown error');
            navigationCallbacks.current.delete(currentSid);
            console.log(`NavigationError: 清空currentNavigationActionSid，之前的值: ${currentSid}`);
            currentNavigationActionSid.current = null;
          }
        }
      }
    );

    const navigationStatusListener = DeviceEventEmitter.addListener(
      'NavigationStatusUpdate',
      (data: NavigationStatusUpdate) => {
        console.log('Navigation Status Update:', data);
        const statusMessage = `🗺️ 导航状态更新
        
📍 目标地点：${data.destination}
📊 状态类型：${data.statusType}
📢 状态信息：${data.message}
📝 详细描述：${data.description}`;
        addMessage(statusMessage, false);
      }
    );

    // 组件卸载时清理PageAgent和事件监听
    // 延迟3秒显示引领功能提示，避免用户来不及看清欢迎消息
    const showTipTimeout = setTimeout(() => {
      const tipMessage: ChatMessage = {
        id: Date.now().toString(),
        text: '💡 小贴士：我还可以为您提供引领服务！\n\n🗣️ 可以试试对我说：\n• "带我去茶水间"\n• "引领我到会议室"\n• "请带我去咖啡厅"（测试失败场景）\n\n我会根据不同地点给出相应的引领结果～',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, tipMessage]);
    }, 3000); // 3秒后显示

    return () => {
      const cleanup = async () => {
        try {
          // 清理定时器
          clearTimeout(showTipTimeout);

          // 移除事件监听
          actionExecutionListener.remove();
          navigationSuccessListener.remove();
          navigationErrorListener.remove();
          navigationStatusListener.remove();

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

  // 自动启动定位的帮助函数
  const handleAutoReposition = async () => {
    try {
      const repositionResult = await AgentOSModule.startRobotReposition();
      if (repositionResult.status === 'success') {
        addMessage('🔄 已自动启动机器人定位，请稍后重试导航', false);
      } else {
        addMessage('❌ 自动启动定位失败，请手动处理', false);
      }
    } catch (error) {
      console.error('Auto reposition failed:', error);
      addMessage('❌ 自动定位启动过程发生错误', false);
    }
  };

  const addMessage = (text: string, isUser: boolean) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text,
      isUser,
      timestamp: new Date(),
    };
    setMessages(prev => {
      const updatedMessages = [...prev, newMessage];
      // 延迟滚动到底部，确保消息已经渲染
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return updatedMessages;
    });
  };

  // 处理Action执行
  const handleActionExecution = async (data: ActionExecutionData) => {
    console.log('=== handleActionExecution called ===');
    console.log('Action data:', data);

    let executionSuccess = false;

    try {
      const { actionName, displayName, userQuery, parameters, sid } = data;

      if (actionName === 'com.agent.demo.leading') {
        // 处理引领Action
        const location = parameters.location || '未知地点';

        // 1. 显示Action触发信息
        const actionTriggeredMessage = `🎯 检测到引领请求！
        
📍 目标地点：${location}
🗨️ 用户问题：${userQuery}
🆔 Action ID：${sid}

🔄 正在检查机器人定位状态...`;

        addMessage(actionTriggeredMessage, false);

        // 2. 检查机器人定位状态
        try {
          const localizationResult = await AgentOSModule.checkRobotLocalization();
          console.log('定位检查结果:', localizationResult);

          const localizationMessage = `📍 定位状态检查完成
          
🤖 机器人状态：${localizationResult.isLocalized ? '已定位 ✅' : '未定位 ❌'}
📋 检查结果：${localizationResult.description}
🔧 系统消息：${localizationResult.message}`;

          addMessage(localizationMessage, false);

          if (!localizationResult.isLocalized) {
            // 如果未定位，自动启动定位
            const repositionMessage = `⚠️ 机器人当前未定位
            
🚫 原因：机器人当前未定位，无法执行引领任务
🔄 自动解决方案：正在启动机器人定位...
⏳ 请稍候，定位完成后将自动继续引领任务`;

            addMessage(repositionMessage, false);

            try {
              // 调用启动定位方法
              const repositionResult = await AgentOSModule.startRobotReposition();
              console.log('启动定位结果:', repositionResult);

              if (repositionResult.status === 'success') {
                const repositionSuccessMessage = `✅ 定位启动成功
                
🤖 已发送定位启动指令
📍 机器人正在进行重新定位
⏱️ 预计定位时间：10-30秒
🔄 定位完成后请重新尝试引领功能`;

                addMessage(repositionSuccessMessage, false);

                // 提示用户稍后重试
                const retryMessage = `💡 温馨提示
                
📋 定位过程需要一些时间
🗣️ 请在机器人定位完成后，重新说出引领指令
📞 如遇问题可联系技术支持`;

                addMessage(retryMessage, false);
              } else {
                const repositionErrorMessage = `❌ 自动定位启动失败
                
🔧 错误信息：${repositionResult.message}
💡 建议：请手动启动定位或联系技术支持
📞 技术支持将协助解决定位问题`;

                addMessage(repositionErrorMessage, false);
              }
            } catch (repositionError) {
              console.error('启动定位失败:', repositionError);
              const repositionFailMessage = `❌ 启动定位过程发生错误
              
🚫 无法自动启动机器人定位
🔧 错误信息：${repositionError}
💡 建议：请手动重启定位或联系技术支持`;

              addMessage(repositionFailMessage, false);
            }

            executionSuccess = false;
          } else {
            // 如果已定位，继续执行引领逻辑
            addMessage('✅ 定位检查通过，开始执行实际导航...', false);

            console.log(`开始导航前往：${location}`);

            // 3. 使用回调机制调用导航功能
            console.log(`开始导航，Action sid: ${sid}`);

            try {
              // 创建导航回调函数
              const navigationCallback = {
                onSuccess: async () => {
                  console.log('Navigation callback: 导航成功');
                  addMessage(`🎉 导航完成成功！
                  
✅ 机器人已成功到达"${location}"
📍 任务状态：已完成
🎯 引领服务圆满结束`, false);

                  // 导航成功，notify成功
                  try {
                    const notifyResponse = await AgentOSModule.notifyActionComplete(sid, true);
                    console.log('Navigation success notify sent:', notifyResponse);

                    addMessage(`🔔 系统通知：引领任务完成成功
                    
✅ 已向AgentOS系统报告任务完成
🎯 Action状态：SUCCEEDED
📋 任务ID：${sid}
⚡ AgentOS将根据成功状态进行后续处理`, false);
                  } catch (notifyError) {
                    console.error('Failed to notify navigation success:', notifyError);
                    addMessage('⚠️ 系统通知失败，但导航已成功完成', false);
                  }
                },

                onError: async (errorCode: number, errorMessage: string) => {
                  console.log(`Navigation callback: 导航失败 - ${errorCode}: ${errorMessage}`);

                  let errorMsg = `❌ 导航失败！
                  
📍 目标地点：${location}
🚫 失败原因：${errorMessage}
📋 错误代码：${errorCode}`;

                  // 根据错误类型提供解决方案
                  if (errorCode === -108) { // DESTINATION_NOT_EXIST
                    errorMsg += `\n\n💡 建议：请检查地点名称是否正确，或查看可用地点列表`;
                  } else if (errorCode === -1) { // ALREADY_RUNNING
                    errorMsg += `\n\n🔄 建议：请等待当前导航完成或手动停止后重试`;
                  }

                  addMessage(errorMsg, false);

                  // 导航失败，notify失败
                  try {
                    const notifyResponse = await AgentOSModule.notifyActionComplete(sid, false);
                    console.log('Navigation error notify sent:', notifyResponse);

                    addMessage(`🔔 系统通知：引领任务执行失败
                    
❌ 已向AgentOS系统报告任务失败
🎯 Action状态：FAILED  
📋 任务ID：${sid}
⚡ AgentOS将根据失败状态进行后续处理`, false);
                  } catch (notifyError) {
                    console.error('Failed to notify navigation error:', notifyError);
                    addMessage('⚠️ 系统通知失败，但导航确实失败了', false);
                  }
                },

                onStatusUpdate: (status: number, data: string) => {
                  console.log(`Navigation status update: ${status} - ${data}`);
                  const statusMessage = `🗺️ 导航状态更新
                  
📍 目标地点：${location}
📊 状态代码：${status}
📢 状态信息：${data}`;
                  addMessage(statusMessage, false);
                }
              };

              // 实现简化版回调机制：注册回调后调用原有API
              console.log(`注册导航回调，sid: ${sid}`);
              navigationCallbacks.current.set(sid, navigationCallback);
              currentNavigationActionSid.current = sid;
              console.log(`回调已注册，当前映射大小: ${navigationCallbacks.current.size}`);
              console.log(`设置currentNavigationActionSid为: ${sid}`);

              const navigationResult = await AgentOSModule.startNavigation(location);
              console.log('导航启动结果:', navigationResult);

              if (navigationResult.status === 'success') {
                executionSuccess = true;
                addMessage(`🚀 导航启动成功！
                
📍 目标地点：${location}
🤖 机器人已开始导航
⏱️ 请跟随机器人前往目的地

💡 导航过程中会有实时状态更新`, false);
              } else {
                executionSuccess = false;
                // 导航启动失败，清理回调并直接notify
                console.log(`导航启动失败: 清空currentNavigationActionSid，之前的值: ${sid}`);
                navigationCallbacks.current.delete(sid);
                currentNavigationActionSid.current = null;

                addMessage(`❌ 导航启动失败！
                
📍 目标地点：${location}
🚫 失败原因：${navigationResult.message}

💡 请检查地点名称或稍后重试`, false);
              }
            } catch (navError) {
              console.error('导航启动失败:', navError);
              executionSuccess = false;
              // 导航调用异常，清理回调并直接notify
              console.log(`导航调用异常: 清空currentNavigationActionSid，之前的值: ${sid}`);
              navigationCallbacks.current.delete(sid);
              currentNavigationActionSid.current = null;

              addMessage(`❌ 导航功能调用失败
              
📍 目标地点：${location}
🔧 错误信息：${navError}
💡 建议：请检查机器人连接状态或联系技术支持`, false);
            }
          }
        } catch (localizationError) {
          console.error('定位检查失败:', localizationError);
          const errorMessage = `❌ 定位检查失败
          
🚫 无法检查机器人定位状态
🔧 错误信息：${localizationError}
💡 建议：请检查机器人连接状态或联系技术支持`;

          addMessage(errorMessage, false);
          executionSuccess = false;
        }

      } else {
        // 处理其他Action
        addMessage(`✅ 执行了Action: ${displayName}\n用户问题: ${userQuery}\n参数: ${JSON.stringify(parameters)}\nAction ID: ${sid}`, false);
        executionSuccess = true;
      }

      // 对于导航Action成功启动的情况，使用回调机制处理notify，这里直接返回
      if (actionName === 'com.agent.demo.leading' && executionSuccess) {
        console.log('导航Action成功启动，回调机制将处理后续notify');
        return;
      }

      // 对于其他Action或导航失败的情况，立即notify
      try {
        const notifyResponse = await AgentOSModule.notifyActionComplete(sid, executionSuccess);
        console.log('Action notify response sent:', notifyResponse);

        if (executionSuccess) {
          addMessage(`🔔 系统通知：引领任务执行成功
          
✅ 已向AgentOS系统报告任务完成
🎯 Action状态：SUCCEEDED
📋 任务ID：${sid}
⚡ AgentOS将根据成功状态进行后续处理`, false);
        } else {
          addMessage(`🔔 系统通知：引领任务执行失败
          
❌ 已向AgentOS系统报告任务失败
🎯 Action状态：FAILED  
📋 任务ID：${sid}
⚡ AgentOS将根据失败状态进行后续处理`, false);
        }
      } catch (notifyError) {
        console.error('Failed to notify action completion:', notifyError);
        addMessage(`⚠️ 系统通知失败
        
🚫 无法向AgentOS系统报告执行状态
🔧 错误信息：${notifyError}
📞 请联系技术支持`, false);
      }

    } catch (error) {
      console.error('Error handling action execution:', error);
      addMessage('❌ 处理Action执行时发生错误', false);

      // 即使处理出错，也要向原生层报告失败状态
      try {
        if (data.sid) {
          await AgentOSModule.notifyActionComplete(data.sid, false);
          console.log('Error response sent to native layer');
        }
      } catch (responseError) {
        console.error('Failed to send error response:', responseError);
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

  const handleVoice = async () => {
    setIsListening(!isListening);
    if (!isListening) {
      try {
        // 移除重复的uploadInterfaceInfo调用，避免覆盖之前上传的导航地点信息
        console.log('语音功能激活，使用已上传的导航界面信息');

        // 提示用户语音功能已激活
        addMessage('🎤 语音功能已激活，请开始说话...', false);

        // 2秒后关闭语音监听状态
        setTimeout(() => {
          setIsListening(false);
          addMessage('语音识别已结束', false);
        }, 2000);

      } catch (error) {
        console.error('Voice activation error:', error);
        setIsListening(false);
        addMessage('语音功能暂时不可用，请使用文字输入', false);
      }
    }
  };

  const handleQuickAction = (question: string) => {
    handleSend(question);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageContainer}>
      {item.isUser ? (
        <View style={styles.userMessageContainer}>
          <View style={styles.userMessage}>
            <Text style={styles.userMessageText}>{item.text}</Text>
          </View>
          <Text style={styles.userIcon}>👤</Text>
        </View>
      ) : (
        <View style={styles.botMessageContainer}>
          <Text style={styles.botIcon}>🤖</Text>
          <View style={styles.botMessage}>
            <Text style={styles.botMessageText}>{item.text}</Text>
          </View>
        </View>
      )}
    </View>
  );

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
              onPress={() => handleQuickAction('社保卡基本信息查询')}
            >
              <Text style={styles.quickButtonText}>社保卡基本信息查询</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAction('企业职工人员信息变更业务')}
            >
              <Text style={styles.quickButtonText}>企业职工人员信息变更业务</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAction('灵活就业人员参保信息查询')}
            >
              <Text style={styles.quickButtonText}>灵活就业人员参保信息查询</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAction('领取失业金期间按月登记')}
            >
              <Text style={styles.quickButtonText}>领取失业金期间按月登记</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAction('机关事业单位特殊工种如何办理退休手续？')}
            >
              <Text style={styles.quickButtonText}>机关事业单位特殊工种如何办理退休手续？</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAction('领取失业金期间按月登记')}
            >
              <Text style={styles.quickButtonText}>领取失业金期间按月登记</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAction('城乡居民生存认证')}
            >
              <Text style={styles.quickButtonText}>城乡居民生存认证</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => handleQuickAction('工伤异地居住（就医） 备案')}
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
  messagesList: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  messagesContent: {
    padding: 8,
  },
  messageContainer: {
    marginVertical: 4,
  },
  userMessageContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  userMessage: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 12,
    maxWidth: '70%',
    marginRight: 8,
  },
  userMessageText: {
    color: '#ffffff',
    fontSize: 16,
  },
  userIcon: {
    fontSize: 24,
  },
  botMessageContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  botMessage: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 12,
    maxWidth: '70%',
    marginLeft: 8,
  },
  botMessageText: {
    color: '#333333',
    fontSize: 16,
  },
  botIcon: {
    fontSize: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#ffffff',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  voiceButton: {
    backgroundColor: '#4CAF50',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  voiceButtonActive: {
    backgroundColor: '#FF5722',
  },
  voiceButtonText: {
    fontSize: 18,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
    backgroundColor: '#f9f9f9',
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ChatScreen; 