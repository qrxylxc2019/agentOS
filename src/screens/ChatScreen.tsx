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
import { ChatMessage, AgentOSModule, ActionConfig, ActionExecutionData, RobotLocalizationResponse, PlaceListResponse, NavigationResponse, NavigationStatusUpdate, NavigationCallback, PersonDetectionEvent, FaceFollowingStatusEvent, BestPersonDetectedEvent, FaceFollowingStatusUpdateEvent, FaceFollowingErrorEvent, FaceFollowingResultEvent, ASRResultEvent, TTSResultEvent } from '../types';

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
  const [isFaceFollowing, setIsFaceFollowing] = useState(false);
  const [followingPersonId, setFollowingPersonId] = useState<string | null>(null);
  const currentNavigationActionSid = useRef<string | null>(null);
  const navigationCallbacks = useRef<Map<string, NavigationCallback>>(new Map());
  const isNavigationInProgress = useRef<boolean>(false);

  // 导航状态UI
  const [navigationStatus, setNavigationStatus] = useState<{
    visible: boolean;
    type: 'preparing' | 'inProgress' | 'success' | 'error';
    message: string;
    destination?: string;
  }>({
    visible: false,
    type: 'preparing',
    message: '',
  });

  useEffect(() => {
    // 注册人脸识别监听器
    AgentOSModule.registerPersonListener()
      .then(result => {
        console.log('人脸识别监听器注册结果:', result);
      })
      .catch(error => {
        console.error('人脸识别监听器注册失败:', error);
      });

    // 监听人脸检测事件
    const personDetectionSubscription = DeviceEventEmitter.addListener(
      'onPersonDetected',
      (event: PersonDetectionEvent) => {
        console.log('rn检测到人脸数量:', event.count);
        if (event.count > 0) {
          // 当检测到人脸时，可以在这里添加相应的处理逻辑
          // 例如：自动问候、记录人脸出现次数等
        }
      }
    );

    // 监听人脸跟随状态变化事件
    const faceFollowingStatusSubscription = DeviceEventEmitter.addListener(
      'onFaceFollowingStatusChanged',
      (event: FaceFollowingStatusEvent) => {
        console.log('人脸跟随状态变化:', event);
        setIsFaceFollowing(event.isFollowing);
        setFollowingPersonId(event.personId || null);

        // 当人脸跟随开始或结束时，可以在这里添加相应的处理逻辑
        if (event.isFollowing) {
          addMessage(`开始跟随人脸 ID: ${event.personId}`, false);
        } else {
          addMessage('停止人脸跟随', false);
        }
      }
    );

    // 监听最佳人脸检测事件
    const bestPersonDetectedSubscription = DeviceEventEmitter.addListener(
      'onBestPersonDetected',
      async (event: BestPersonDetectedEvent) => {
        console.log('🎯 RN收到最佳人脸检测事件 - 人脸ID:', event.personId, ', 距离:', event.distance.toFixed(2), '米');

        // 检查是否正在导航中，如果是则忽略人脸检测事件
        if (isNavigationInProgress.current) {
          console.log('🚫 当前正在导航中，忽略人脸检测事件');
          addMessage(`🚫 导航中忽略人脸检测 ID: ${event.personId}`, false);
          return;
        }

        addMessage(`🎯 检测到最佳人脸 ID: ${event.personId}，距离: ${event.distance.toFixed(2)}米`, false);

        // 自动开始人脸跟随
        try {
          console.log('🚀 RN层自动开始人脸跟随，人脸ID:', event.personId);
          const result = await AgentOSModule.startFaceFollowingByPersonId(event.personId);
          if (result.success) {
            console.log('✅ 人脸跟随启动成功:', result.message);
            addMessage(`🚀 开始跟随人脸 ID: ${event.personId}`, false);
          } else {
            console.log('❌ 人脸跟随启动失败:', result.message);
            addMessage(`❌ 跟随启动失败: ${result.message}`, false);
          }
        } catch (error) {
          console.error('💥 启动人脸跟随时发生错误:', error);
          addMessage(`💥 跟随启动错误: ${error}`, false);
        }
      }
    );

    // 监听人脸跟踪状态更新事件
    const faceFollowingStatusUpdateSubscription = DeviceEventEmitter.addListener(
      'onFaceFollowingStatusUpdate',
      async (event: FaceFollowingStatusUpdateEvent) => {
        console.log('📊 人脸跟踪状态更新 - status:', event.status, 'data:', event.data, 'personId:', event.personId);
        addMessage(`📊 跟踪状态: ${event.data} (状态码: ${event.status})`, false);

        // 根据状态决定是否需要停止跟踪和重置SessionId
        if (event.status === 1003) { // STATUS_GUEST_LOST - 检测不到人脸
          console.log('🔄 检测不到人脸，RN层主动停止人脸跟踪');

          // 立即停止人脸跟踪
          try {
            await AgentOSModule.stopFaceFollowing();
            console.log('🛑 RN层成功停止人脸跟踪');
            addMessage('🛑 检测不到人脸，已停止跟踪', false);
          } catch (error) {
            console.error('💥 RN层停止人脸跟踪失败:', error);
          }

          // 启动30秒延迟重置SessionId
          setTimeout(async () => {
            try {
              const sessionResult = await AgentOSModule.generateNewSessionId();
              if (sessionResult.success) {
                console.log('🆔 因人脸丢失重置SessionId成功:', sessionResult.sessionId);
                addMessage(`🆔 会话已重置: ${sessionResult.sessionId}`, false);
              }
            } catch (error) {
              console.error('💥 重置SessionId失败:', error);
            }
          }, 30000);
        } else if (event.status === 1002) { // STATUS_GUEST_APPEAR - 目标重新出现
          console.log('✅ 人脸重新出现，取消SessionId重置');
          // 这里可以取消之前的延迟重置（如果需要的话）
        }
      }
    );

    // 监听人脸跟踪错误事件
    const faceFollowingErrorSubscription = DeviceEventEmitter.addListener(
      'onFaceFollowingError',
      async (event: FaceFollowingErrorEvent) => {
        console.log('❌ 人脸跟踪错误 - errorCode:', event.errorCode, 'errorString:', event.errorString, 'personId:', event.personId);
        addMessage(`❌ 跟踪错误: ${event.errorString} (错误码: ${event.errorCode})`, false);

        // 对于特定的错误，RN层主动停止跟踪
        if (event.errorCode === -108 || event.errorCode === -1 || event.errorCode === -107) {
          // -108: ERROR_TARGET_NOT_FOUND, -1: ERROR_SET_TRACK_FAILED, -107: ACTION_RESPONSE_REQUEST_RES_ERROR
          console.log('🔄 跟踪错误，RN层主动停止人脸跟踪');

          // 立即停止人脸跟踪
          try {
            await AgentOSModule.stopFaceFollowing();
            console.log('🛑 RN层因错误停止人脸跟踪成功');
            addMessage(`🛑 跟踪出错已停止: ${event.errorString}`, false);

            // 对于目标未找到的错误，延迟重置SessionId
            if (event.errorCode === -108 || event.errorCode === -1) {
              setTimeout(async () => {
                try {
                  const sessionResult = await AgentOSModule.generateNewSessionId();
                  if (sessionResult.success) {
                    console.log('🆔 因跟踪错误重置SessionId成功:', sessionResult.sessionId);
                    addMessage(`🆔 会话已重置: ${sessionResult.sessionId}`, false);
                  }
                } catch (error) {
                  console.error('💥 重置SessionId失败:', error);
                }
              }, 30000);
            }
          } catch (error) {
            console.error('💥 RN层停止人脸跟踪失败:', error);
          }
        }
      }
    );

    // 监听人脸跟踪结果事件
    const faceFollowingResultSubscription = DeviceEventEmitter.addListener(
      'onFaceFollowingResult',
      (event: FaceFollowingResultEvent) => {
        NativeModules.AgentOSModule.addLog(`🎯 跟踪结果: ${event.responseString} (状态: ${event.status})`);
      }
    );

    // 监听ASR（语音识别）结果事件
    const asrResultSubscription = DeviceEventEmitter.addListener(
      'onASRResult',
      (event: ASRResultEvent) => {
        if (event.final) {
          // 只在最终结果时显示消息
          NativeModules.AgentOSModule.addLog(`rn语音识别: ${event.text}`);
        }
      }
    );

    // 监听TTS（语音合成）结果事件
    const ttsResultSubscription = DeviceEventEmitter.addListener(
      'onTTSResult',
      (event: TTSResultEvent) => {
        console.log('🔊 TTS结果 - text:', event.text, 'final:', event.final);
        if (event.final) {
          // 只在最终结果时显示消息
          addMessage(`🔊 语音合成: ${event.text}`, false);
        }
      }
    );


    // 测试原生模块是否可用
    console.log('=== ChatScreen useEffect ===');
    console.log('Available NativeModules:', Object.keys(NativeModules));
    console.log('AgentOSModule exists:', !!NativeModules.AgentOSModule);
    console.log('AgentOSModule methods:', NativeModules.AgentOSModule ? Object.keys(NativeModules.AgentOSModule) : 'undefined');
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

          // 8. 设置ASR和TTS监听器（在PageAgent开始后立即设置）
          try {
            const transcribeResult = await NativeModules.AgentOSModule.setTranscribeListener(pageId);
            console.log('✅ ASR和TTS监听器设置成功:', transcribeResult);
            addMessage('🎤 语音识别和语音合成监听器已启用', false);
          } catch (transcribeError) {
            console.error('❌ 设置ASR和TTS监听器失败:', transcribeError);
            addMessage('⚠️ 语音监听器设置失败，可能影响语音功能', false);
          }

          // 10. 生成新的SessionId
          try {
            const sessionResult = await NativeModules.AgentOSModule.generateNewSessionId();
            if (sessionResult.success) {
              console.log('✅ SessionId生成成功:', sessionResult.sessionId);
              addMessage(`🆔 会话已初始化: ${sessionResult.sessionId}`, false);
            } else {
              console.error('❌ SessionId生成失败:', sessionResult.message);
            }
          } catch (sessionError) {
            console.error('💥 SessionId生成异常:', sessionError);
          }

          // 11. 上传页面信息
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
          personDetectionSubscription.remove();
          faceFollowingStatusSubscription.remove();
          bestPersonDetectedSubscription.remove();
          faceFollowingStatusUpdateSubscription.remove();
          faceFollowingErrorSubscription.remove();
          faceFollowingResultSubscription.remove();
          asrResultSubscription.remove();
          ttsResultSubscription.remove();

          if (NativeModules.AgentOSModule) {
            // 停止人脸跟随（如果正在进行）
            if (isFaceFollowing) {
              await NativeModules.AgentOSModule.stopFaceFollowing();
              console.log('人脸跟随已停止');
            }

            // 注销人脸识别监听器
            await NativeModules.AgentOSModule.unregisterPersonListener();
            console.log('人脸识别监听器已注销');

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

  // 导航状态管理函数
  const showNavigationStatus = (type: 'preparing' | 'inProgress' | 'success' | 'error', message: string, destination?: string) => {
    setNavigationStatus({
      visible: true,
      type,
      message,
      destination,
    });

    // 如果是成功或错误状态，3秒后自动隐藏
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        setNavigationStatus(prev => ({ ...prev, visible: false }));
      }, 3000);
    }
  };

  const hideNavigationStatus = () => {
    setNavigationStatus(prev => ({ ...prev, visible: false }));
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

                  // 清除导航进行中标志
                  isNavigationInProgress.current = false;
                  console.log('🏁 导航成功，清除导航进行中标志');

                  // 显示导航成功状态
                  showNavigationStatus('success', `已成功到达 ${location}`, location);

                  addMessage(`🎉 导航完成成功！
                  
✅ 机器人已成功到达"${location}"
📍 任务状态：已完成
🎯 引领服务圆满结束`, false);

                  // 导航成功后，RN层重新注册人脸监听器
                  try {
                    console.log('🔄 导航成功后，RN层重新注册人脸监听器');
                    await AgentOSModule.registerPersonListener();
                    console.log('✅ RN层成功重新注册人脸监听器');
                    addMessage('👁️ 已重新启用人脸检测功能', false);
                  } catch (registerError) {
                    console.error('💥 RN层重新注册人脸监听器失败:', registerError);
                  }

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

                  // 清除导航进行中标志
                  isNavigationInProgress.current = false;
                  console.log('🏁 导航失败，清除导航进行中标志');

                  // 显示导航失败状态
                  showNavigationStatus('error', `导航失败: ${errorMessage}`, location);

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

                  // 导航失败后，RN层重新注册人脸监听器
                  try {
                    console.log('🔄 导航失败后，RN层重新注册人脸监听器');
                    await AgentOSModule.registerPersonListener();
                    console.log('✅ RN层成功重新注册人脸监听器');
                    addMessage('👁️ 已重新启用人脸检测功能', false);
                  } catch (registerError) {
                    console.error('💥 RN层重新注册人脸监听器失败:', registerError);
                  }

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

              // 导航开始前，优化执行顺序：先注销监听器，再停止跟踪，最后开始导航
              console.log('🚀 即将开始导航前的准备工作...');

              // 显示准备中状态
              showNavigationStatus('preparing', '正在准备导航...', location);

              // 设置导航进行中标志，防止人脸检测事件干扰
              isNavigationInProgress.current = true;
              console.log('🚩 设置导航进行中标志，防止人脸检测干扰');

              try {
                // 第一步：先注销人脸监听器，从源头切断事件流
                console.log('🚫 第一步：导航开始前，RN层主动注销人脸监听器');
                const unregisterResult = await AgentOSModule.unregisterPersonListener();
                console.log('✅ RN层成功注销人脸监听器，结果:', unregisterResult);

                // 第二步：再停止人脸跟踪
                console.log('🛑 第二步：导航开始前，RN层主动停止人脸跟踪');
                const stopResult = await AgentOSModule.stopFaceFollowing();
                console.log('✅ RN层成功停止人脸跟踪，结果:', stopResult);

                console.log('🎯 人脸功能已全部停止，准备开始导航');
                addMessage('🛑 已停止人脸跟踪和监听，开始导航', false);
              } catch (stopError) {
                console.error('💥 RN层停止人脸功能失败:', stopError);
                addMessage('⚠️ 停止人脸功能时出错，但仍将尝试导航', false);
                // 即使停止失败也继续导航
              }

              console.log('🗺️ 第三步：即将调用 AgentOSModule.startNavigation...');

              const navigationResult = await AgentOSModule.startNavigation(location);
              console.log('导航启动结果:', navigationResult);

              if (navigationResult.status === 'success') {
                executionSuccess = true;

                // 显示导航进行中状态
                showNavigationStatus('inProgress', `正在导航至 ${location}...`, location);

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

                // 显示导航失败状态
                showNavigationStatus('error', `导航启动失败: ${navigationResult.message}`, location);

                // 清除导航进行中标志
                isNavigationInProgress.current = false;
                console.log('🏁 导航启动失败，清除导航进行中标志');

                // 导航启动失败后，RN层重新注册人脸监听器
                try {
                  console.log('🔄 导航启动失败后，RN层重新注册人脸监听器');
                  await AgentOSModule.registerPersonListener();
                  console.log('✅ RN层成功重新注册人脸监听器');
                  addMessage('👁️ 已重新启用人脸检测功能', false);
                } catch (registerError) {
                  console.error('💥 RN层重新注册人脸监听器失败:', registerError);
                }

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

              // 显示导航异常状态
              showNavigationStatus('error', `导航功能异常: ${navError}`, location);

              // 清除导航进行中标志
              isNavigationInProgress.current = false;
              console.log('🏁 导航调用异常，清除导航进行中标志');

              // 导航调用异常后，RN层重新注册人脸监听器
              try {
                console.log('🔄 导航调用异常后，RN层重新注册人脸监听器');
                await AgentOSModule.registerPersonListener();
                console.log('✅ RN层成功重新注册人脸监听器');
                addMessage('👁️ 已重新启用人脸检测功能', false);
              } catch (registerError) {
                console.error('💥 RN层重新注册人脸监听器失败:', registerError);
              }

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

      } else if (actionName === 'orion.agent.action.SOCIAL_INSURANCE') {
        // 处理社保问答Action
        const question = parameters.question || '社保相关问题';
        console.log(`收到社保问题: ${question}`);

        // 显示用户问题
        addMessage(`📋 收到社保咨询请求：\n${question}`, false);

        // 这里可以根据不同的问题提供不同的回答
        // 实际应用中可能需要调用后端API或大模型来获取答案
        let answer = '';

        if (question.includes('养老保险')) {
          answer = `关于养老保险的咨询：
          
养老保险是社会保险的重要组成部分，主要为参保人员年老后提供基本生活保障。
主要缴费方式有：
1. 职工养老保险：单位和个人共同缴纳，单位缴费比例一般为16%，个人缴费比例为8%
2. 城乡居民养老保险：个人缴费、集体补助和政府补贴相结合

领取条件通常包括：
- 达到法定退休年龄（男性60岁，女干部55岁，女工人50岁）
- 累计缴费满15年

如需了解更多详细信息，可咨询当地社保机构或通过国家社会保险公共服务平台查询。`;
        } else if (question.includes('医疗保险')) {
          answer = `关于医疗保险的咨询：
          
医疗保险是为参保人员提供基本医疗保障的社会保险制度。
主要特点：
1. 职工医保：用人单位和职工共同缴纳，报销比例较高
2. 城乡居民医保：个人缴费和政府补贴相结合，报销比例相对较低

医保报销范围通常包括：
- 门诊费用（普通门诊和特殊门诊）
- 住院费用
- 部分药品费用（医保目录内药品）

就医时请携带医保卡，按规定先自付部分费用，再由医保基金支付剩余部分。具体报销比例和起付线因地区和医院等级而异。`;
        } else if (question.includes('失业保险')) {
          answer = `关于失业保险的咨询：
          
失业保险为非因本人意愿中断就业、并符合领取条件的失业人员提供基本生活保障。

领取条件通常包括：
1. 用人单位和本人已缴纳失业保险费满1年以上
2. 非因本人意愿中断就业
3. 已办理失业登记，并有求职要求

失业保险金领取期限根据累计缴费时间确定：
- 缴费1-5年，最长领取12个月
- 缴费5-10年，最长领取18个月
- 缴费10年以上，最长领取24个月

领取期间还可享受职业培训、就业指导等服务。`;
        } else if (question.includes('工伤保险')) {
          answer = `关于工伤保险的咨询：
          
工伤保险是为职工因工作原因遭受事故伤害或患职业病提供医疗救治和经济补偿的社会保险制度。

工伤认定标准主要包括：
1. 在工作时间、工作场所内，因工作原因受到的伤害
2. 工作时间前后在工作场所内，从事与工作有关的预备性或收尾性工作受到的伤害
3. 在工作时间和工作场所内，因履行工作职责受到暴力等意外伤害
4. 患职业病
5. 因工外出期间，由于工作原因受到的伤害
6. 法律、行政法规规定应当认定为工伤的其他情形

工伤待遇包括医疗费用报销、伤残津贴、一次性伤残补助金等，具体标准根据伤残等级和当地政策确定。`;
        } else {
          answer = `感谢您咨询社保相关问题。
          
社会保险主要包括五大险种：养老保险、医疗保险、失业保险、工伤保险和生育保险。

基本参保流程：
1. 就业人员：通常由用人单位为员工办理参保手续
2. 灵活就业人员：可到当地社保经办机构自行办理参保手续
3. 城乡居民：可到户籍所在地社区或乡镇办理居民养老保险和医疗保险

社保缴费基数和比例因地区和险种而异，建议咨询当地社保经办机构获取最新政策。

社保关系转移接续：
跨统筹区域就业时，可办理社保关系转移接续手续，确保权益连续计算。

如有更具体的问题，请详细咨询，我会为您提供更精准的解答。`;
        }

        // 添加回答消息
        addMessage(answer, false);

        executionSuccess = true;
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

  // 渲染导航状态小弹窗
  const renderNavigationStatus = () => {
    if (!navigationStatus.visible) return null;

    const getStatusIcon = () => {
      switch (navigationStatus.type) {
        case 'preparing':
          return '⏳';
        case 'inProgress':
          return '🚶‍♂️';
        case 'success':
          return '✅';
        case 'error':
          return '❌';
        default:
          return '📍';
      }
    };

    const getStatusColor = () => {
      switch (navigationStatus.type) {
        case 'preparing':
          return '#FFA500';
        case 'inProgress':
          return '#2196F3';
        case 'success':
          return '#4CAF50';
        case 'error':
          return '#F44336';
        default:
          return '#666';
      }
    };

    return (
      <View style={styles.navigationStatusOverlay}>
        <View style={[styles.navigationStatusCard, { borderLeftColor: getStatusColor() }]}>
          <View style={styles.navigationStatusHeader}>
            <Text style={styles.navigationStatusIcon}>{getStatusIcon()}</Text>
            <Text style={styles.navigationStatusTitle}>
              {navigationStatus.destination && `前往 ${navigationStatus.destination}`}
            </Text>
            {navigationStatus.type !== 'inProgress' && (
              <TouchableOpacity
                style={styles.navigationStatusClose}
                onPress={hideNavigationStatus}
              >
                <Text style={styles.navigationStatusCloseText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.navigationStatusMessage}>{navigationStatus.message}</Text>
          {navigationStatus.type === 'inProgress' && (
            <View style={styles.progressBar}>
              <View style={styles.progressBarFill} />
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, backgroundStyle]}>
      {/* 导航状态小弹窗 */}
      {renderNavigationStatus()}

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
  faceFollowingContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faceFollowingText: {
    color: 'white',
    fontSize: 16,
    flex: 1,
  },
  stopFollowingButton: {
    backgroundColor: '#FF5722',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 10,
  },
  stopFollowingButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
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
  // 导航状态小弹窗样式
  navigationStatusOverlay: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 1000,
    elevation: 10,
  },
  navigationStatusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  navigationStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  navigationStatusIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  navigationStatusTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  navigationStatusClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navigationStatusCloseText: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
  navigationStatusMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 2,
    width: '100%',
    transform: [{ translateX: -100 }],
    animation: 'slide 2s infinite',
  },
});

export default ChatScreen; 