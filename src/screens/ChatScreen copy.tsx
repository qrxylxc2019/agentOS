import React, {useState, useEffect, useRef} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  NativeModules,
  DeviceEventEmitter,
} from 'react-native';
import {ChatMessage, AgentOSModule, ActionConfig, ActionExecutionData} from '../types';

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
    backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5',
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

🔄 正在启动引领服务...`;

        addMessage(actionTriggeredMessage, false);
        
        console.log(`开始引领用户前往：${location}`);
        
        // 2. 模拟具体的引领场景并显示结果
        if (location.includes('茶水间')) {
          console.log(`导航成功：开始引领前往茶水间`);
          executionSuccess = true;
          
          const successMessage = `✅ 引领执行成功！
          
🚀 正在为您带路前往茶水间
📍 当前位置：大厅
🗺️ 规划路径：
   大厅 → 走廊 → 茶水间
⏱️ 预计到达：2分钟
🚶‍♂️ 请跟随我的指引前进！

💧 茶水间设施：
• 饮水机、热水器
• 茶叶、咖啡包
• 微波炉、冰箱`;
          
          addMessage(successMessage, false);
          
        } else if (location.includes('咖啡厅')) {
          console.log(`导航失败：咖啡厅暂时关闭`);
          executionSuccess = false;
          
          const failureMessage = `❌ 引领执行失败！
          
🚫 很抱歉，咖啡厅今日暂时关闭
🔧 关闭原因：设备维护中
⏰ 预计恢复：明天上午9:00

🔄 建议替代地点：
• 🍵 茶水间（2楼走廊）
• 🍽️ 员工餐厅（1楼大厅）
• 🏪 便利店（楼下1楼）

💡 可以说"带我去茶水间"试试成功场景～`;
          
          addMessage(failureMessage, false);
          
        } else {
          console.log(`导航成功：开始引领前往 ${location}`);
          executionSuccess = true;
          
          const defaultSuccessMessage = `✅ 引领执行成功！
          
🚀 正在为您带路前往"${location}"
🗺️ 正在规划最佳路径...
🚶‍♂️ 请跟随我的指引前进
❓ 如需帮助请随时告诉我`;
          
          addMessage(defaultSuccessMessage, false);
        }
        
      } else {
        // 处理其他Action
        addMessage(`✅ 执行了Action: ${displayName}\n用户问题: ${userQuery}\n参数: ${JSON.stringify(parameters)}\nAction ID: ${sid}`, false);
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

  const handleSend = async () => {
    if (inputText.trim()) {
      addMessage(inputText, true);
      const queryText = inputText;
      setInputText('');
      
      // 调试信息：检查AgentOSModule是否可用
      console.log('=== ChatScreen handleSend called ===');
      console.log('NativeModules:', Object.keys(NativeModules));
      console.log('NativeModules.AgentOSModule:', NativeModules.AgentOSModule);
      console.log('AgentOSModule from types:', AgentOSModule);
      console.log('AgentOSModule.query:', AgentOSModule?.query);
      
      try {
        if (NativeModules.AgentOSModule) {
          // 调用AgentOS SDK的query方法
          console.log('Calling NativeModules.AgentOSModule.query with:', queryText);
          const result = await NativeModules.AgentOSModule.query(queryText);
          console.log('AgentOS query result:', result);
          
          // 显示成功反馈消息
          addMessage(`已接收到您的问题："${queryText}"，正在处理中...`, false);
        } else {
          console.error('AgentOSModule not available');
          addMessage('原生模块不可用，无法调用AgentOS SDK', false);
        }
        
      } catch (error) {
        console.error('AgentOS query error:', error);
        console.error('Error details:', error);
        // 显示错误消息
        addMessage('抱歉，处理您的请求时出现了问题，请稍后再试。', false);
      }
    }
  };

  const handleVoice = async () => {
    setIsListening(!isListening);
    if (!isListening) {
      try {
        // 上传当前页面信息，帮助AgentOS理解当前页面内容
        const interfaceInfo = `当前页面是聊天界面，包含：
        - 消息列表：显示${messages.length}条对话记录
        - 输入框：用户可以输入文本消息
        - 语音按钮：用户可以通过语音进行交互
        - 发送按钮：发送用户消息`;
        
        await AgentOSModule.uploadInterfaceInfo(interfaceInfo);
        console.log('Interface info uploaded successfully');
        
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

  const renderMessage = ({item}: {item: ChatMessage}) => (
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
      {/* 标题栏 */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, {color: isDarkMode ? '#ffffff' : '#333333'}]}>
          社保小助手哈哈
        </Text>
        <Text style={[styles.headerSubtitle, {color: isDarkMode ? '#cccccc' : '#666666'}]}>
          社会保险咨询服务
        </Text>
      </View>

      {/* 消息列表 */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => {
          // 当内容大小改变时也滚动到底部
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
      />

      {/* 输入区域 */}
      <View style={styles.inputContainer}>
        <TouchableOpacity 
          style={[styles.voiceButton, isListening && styles.voiceButtonActive]} 
          onPress={handleVoice}
        >
          <Text style={styles.voiceButtonText}>
            {isListening ? '⏹️' : '🎤'}
          </Text>
        </TouchableOpacity>
        
        <TextInput
          style={[styles.textInput, {color: isDarkMode ? '#ffffff' : '#333333'}]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="输入消息..."
          placeholderTextColor={isDarkMode ? '#888888' : '#999999'}
          multiline
          maxLength={500}
        />
        
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>发送</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
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