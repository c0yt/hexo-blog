document.addEventListener('DOMContentLoaded', () => {
  const app = new Vue({
    el: '#app',
    data() {
      return {
        copyNotify: null,
        welcomeShown: false,
        debuggerCount: 0,
        viewSourceCount: 0
      }
    },
    methods: {
      // 复制成功通知（防抖）
      showCopyNotify: debounce(function() {
        this.$notify({
          title: "复制成功！ovo",
          message: "转载要记得加上原文链接哦 ~",
          position: "top-right",
          offset: 50,
          showClose: true,
          type: "success",
          duration: 3000
        });
      }, 300),

      // 欢迎通知（防抖）- 每次新会话显示一次
      showWelcome: debounce(function() {
        // 使用 sessionStorage 来控制，每次新会话（重新打开浏览器/标签页）都会显示
        const hasShownWelcomeInSession = sessionStorage.getItem('hasShownWelcomeInSession');

        if (!hasShownWelcomeInSession) {
          this.$notify({
            title: "欢迎光临 ~",
            message: "茶已备好，来饮茶咩 ~ ",
            position: "top-right",
            offset: 50,
            showClose: true,
            type: "success",
            duration: 4000
          });

          // 标记本次会话已显示欢迎信息
          sessionStorage.setItem('hasShownWelcomeInSession', 'true');
          this.welcomeShown = true;
        }
      }, 300),

      // Think页面特殊提示
      showThinkPageNotify: debounce(function() {
        this.$notify({
          title: "布豪！被你发现啦 ~",
          message: "你是外星人，主人不让我给你看捏 ~",
          position: "top-right",
          offset: 50,
          showClose: true,
          type: "warning",
          duration: 4000
        });
      }, 300),

      // 反调试通知（防抖）
      showDebugWarning: debounce(function() {
        const messages = [
          "别看了别看了，这里啥都没有 ~ ",
          "再看就要警告第" + (this.debuggerCount + 1) + "次了！",
          "你是不是想扒我站？现在是不是很内疚？",
          "这么热爱学习，不如给本站打赏点饮料钱？",
          "你就这么想看我的源码吗？那给你看看也不是不行啦~"
        ];
        
        this.debuggerCount++;
        this.$notify({
          title: "Hacker！！被发现啦！(事件你)",
          message: messages[this.debuggerCount % messages.length],
          position: "top-right",
          offset: 50,
          showClose: true,
          type: "error",
          duration: 3000
        });
      }, 300),

      // 查看源代码通知（防抖）
      showViewSourceWarning: debounce(function() {
        const messages = [
          "按什么按，又想看源码了是吧？",
          "这些快捷键我都知道，你是斗不过我的！",
          "你以为这样就能看到源码吗？我早就猜到啦！",
          "再按就要警告第" + (this.viewSourceCount + 1) + "次了哦！",
          "都说了source看不了啦，死心吧少年！",
          "要源码给源码！来看看我的茶话会吧～"
        ];
        
        this.viewSourceCount++;
        this.$notify({
          title: "Hacker！！被发现啦！",
          message: messages[this.viewSourceCount % messages.length],
          position: "top-right",
          offset: 50,
          showClose: true,
          type: "warning",
          duration: 3000
        });
      }, 300)
    },
    mounted() {
      // 检查当前页面路径
      const currentPath = window.location.pathname;

      // 每次新会话显示欢迎信息（延迟显示，让页面完全加载）
      setTimeout(() => {
        this.showWelcome();
      }, 1000);

      // 如果是 think 页面，显示特殊提示
      if (currentPath.includes('/think') || currentPath.includes('/think/')) {
        setTimeout(() => {
          this.showThinkPageNotify();
        }, 1500); // 稍微延迟一点，避免与欢迎信息重叠
      }

      // 添加复制按钮点击监听
      document.querySelectorAll('.copy-button').forEach(btn => {
        btn.addEventListener('click', () => {
          this.showCopyNotify();
        });
      });

      // 添加反调试监听
      const handler = setInterval(() => {
        const before = new Date();
        debugger;
        const after = new Date();
        const cost = after.getTime() - before.getTime();
        if (cost > 100) {
          this.showDebugWarning();
        }
      }, 1000);
      
      // 添加查看源代码检测
      document.addEventListener('keydown', (e) => {
        // 检测 Ctrl+U
        if (e.ctrlKey && e.key === 'u') {
          e.preventDefault();
          this.showViewSourceWarning();
        }
        // 检测 Ctrl+Shift+I 或 F12
        if ((e.ctrlKey && e.shiftKey && e.key === 'I') || e.key === 'F12') {
          e.preventDefault();
          this.showDebugWarning();
        }
        // 检测 Ctrl+Shift+C
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
          e.preventDefault();
          this.showDebugWarning();
        }
      });

      // 在组件销毁时清理定时器
      this.$once('hook:beforeDestroy', () => {
        clearInterval(handler);
      });
    },
    beforeDestroy() {
      // 移除复制按钮事件监听
      document.querySelectorAll('.copy-button').forEach(btn => {
        btn.removeEventListener('click', this.showCopyNotify);
      });

      // 移除事件监听
      document.removeEventListener('keydown', this.showViewSourceWarning);
    }
  });

  // 复制事件监听
  document.addEventListener("copy", debounce(() => {
    if (app) {
      app.showCopyNotify();
    }
  }, 300));
});

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function() {
    let context = this;
    let args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  }
}