/* global CryptoJS */

'use strict';

// Shuoshuo解密功能 - 继承hexo-blog-encrypt的解密逻辑
(() => {
  'use strict';

  const cryptoObj = window.crypto || window.msCrypto;
  const storage = window.localStorage;

  const keySalt = textToArray('hexo-blog-encrypt的作者们都是大帅比!');
  const ivSalt = textToArray('hexo-blog-encrypt是地表最强Hexo加密插件!');
  const knownPrefix = "<hbe-prefix></hbe-prefix>";

  function textToArray(s) {
    var i = s.length;
    var n = 0;
    var ba = new Array()

    for (var j = 0; j < i;) {
      var c = s.codePointAt(j);
      if (c < 128) {
        ba[n++] = c;
        j++;
      } else if ((c > 127) && (c < 2048)) {
        ba[n++] = (c >> 6) | 192;
        ba[n++] = (c & 63) | 128;
        j++;
      } else if ((c > 2047) && (c < 65536)) {
        ba[n++] = (c >> 12) | 224;
        ba[n++] = ((c >> 6) & 63) | 128;
        ba[n++] = (c & 63) | 128;
        j++;
      } else {
        ba[n++] = (c >> 18) | 240;
        ba[n++] = ((c >> 12) & 63) | 128;
        ba[n++] = ((c >> 6) & 63) | 128;
        ba[n++] = (c & 63) | 128;
        j += 2;
      }
    }
    return new Uint8Array(ba);
  }

  function hexToArray(s) {
    return new Uint8Array(s.match(/[\da-f]{2}/gi).map((h => {
      return parseInt(h, 16);
    })));
  }

  async function getExecutableScript(oldElem) {
    let out = document.createElement('script');
    const attList = ['type', 'text', 'src', 'crossorigin', 'defer', 'referrerpolicy'];
    attList.forEach((att) => {
      if (oldElem[att])
        out[att] = oldElem[att];
    })

    return out;
  }

  async function convertHTMLToElement(content) {
    let out = document.createElement('div');
    out.innerHTML = content;
    out.querySelectorAll('script').forEach(async (elem) => {
      elem.replaceWith(await getExecutableScript(elem));
    });

    return out;
  }

  function getKeyMaterial(password) {
    let encoder = new TextEncoder();
    return cryptoObj.subtle.importKey(
      'raw',
      encoder.encode(password),
      {
        'name': 'PBKDF2',
      },
      false,
      [
        'deriveKey',
        'deriveBits',
      ]
    );
  }

  function getHmacKey(keyMaterial) {
    return cryptoObj.subtle.deriveKey({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': keySalt.buffer,
      'iterations': 1024
    }, keyMaterial, {
      'name': 'HMAC',
      'hash': 'SHA-256',
      'length': 256,
    }, true, [
      'verify',
    ]);
  }

  function getDecryptKey(keyMaterial) {
    return cryptoObj.subtle.deriveKey({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': keySalt.buffer,
      'iterations': 1024,
    }, keyMaterial, {
      'name': 'AES-CBC',
      'length': 256,
    }, true, [
      'decrypt',
    ]);
  }

  function getIv(keyMaterial) {
    return cryptoObj.subtle.deriveBits({
      'name': 'PBKDF2',
      'hash': 'SHA-256',
      'salt': ivSalt.buffer,
      'iterations': 512,
    }, keyMaterial, 16 * 8);
  }

  async function verifyContent(key, content, hmacDigest) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(content);

    let signature = hexToArray(hmacDigest);

    const result = await cryptoObj.subtle.verify({
      'name': 'HMAC',
      'hash': 'SHA-256',
    }, key, signature, encoded);
    
    return result;
  }

  async function decrypt(decryptKey, iv, hmacKey, encryptedData, hmacDigest, container) {
    let typedArray = hexToArray(encryptedData);

    const result = await cryptoObj.subtle.decrypt({
      'name': 'AES-CBC',
      'iv': iv,
    }, decryptKey, typedArray.buffer).then(async (result) => {
      const decoder = new TextDecoder();
      const decoded = decoder.decode(result);

      // check the prefix, if not then we can sure here is wrong password.
      if (!decoded.startsWith(knownPrefix)) {
        throw "Decode successfully but not start with KnownPrefix.";
      }

      // 移除前缀并渲染markdown内容
      const content = decoded.substring(knownPrefix.length);
      let renderedContent = content;
      
      // 简单的markdown渲染（换行处理）
      renderedContent = renderedContent.replace(/\n/g, '<br>');
      
      container.innerHTML = renderedContent;

      // support html5 lazyload functionality.
      container.querySelectorAll('img').forEach((elem) => {
        if (elem.getAttribute("data-src") && !elem.src) {
          elem.src = elem.getAttribute('data-src');
        }
      });

      // 显示解密成功的萌化提示
      showCuteNotification('', '哇噻，你居然猜对了喵 ~', 'success');

      // 解密成功后显示标签和评论按钮
      showShuoshuoFooter(container);

      // trigger event
      var event = new Event('hexo-blog-decrypt');
      window.dispatchEvent(event);

      return await verifyContent(hmacKey, decoded, hmacDigest);
    }).catch((e) => {
      // 使用萌化的通知提示，而不是alert弹窗
      showCuteNotification('', '哒咩 ~ 主人不让我告诉你捏', 'error');
      console.log(e);
      return false;
    });

    return result;
  }

  // 显示shuoshuo的标签和评论按钮
  function showShuoshuoFooter(container) {
    // 从容器ID中提取key
    const containerId = container.id;
    const key = containerId.replace('shuoshuo-encrypt-', '');

    // 查找对应的shuoshuo项目
    const shuoshuoItem = container.closest('.shuoshuo-item');
    if (!shuoshuoItem) return;

    // 从全局数据中获取shuoshuo信息（如果可用）
    if (window.shuoshuoData && window.shuoshuoData[key]) {
      const itemData = window.shuoshuoData[key];

      // 创建footer元素
      const footer = document.createElement('div');
      footer.className = 'shuoshuo-footer';

      let footerContent = '';

      // 添加标签
      if (itemData.tags && itemData.tags.length > 0) {
        footer.classList.add('flex-between');
        footerContent += '<div class="shuoshuo-tags">';
        itemData.tags.forEach(tag => {
          footerContent += `<span class="shuoshuo-tag">${tag}</span>`;
        });
        footerContent += '</div>';
      } else {
        footer.classList.add('flex-end');
      }

      // 添加评论按钮
      if (itemData.key && window.commentsJsLoad) {
        footerContent += `
          <div class="shuoshuo-comment-btn" onclick="addCommentToShuoshuo(event)">
            <i class="fa-solid fa-comments"></i>
          </div>
        `;
      }

      footer.innerHTML = footerContent;

      // 将footer添加到shuoshuo内容后面
      const shuoshuoContent = shuoshuoItem.querySelector('.shuoshuo-content');
      if (shuoshuoContent) {
        shuoshuoContent.parentNode.insertBefore(footer, shuoshuoContent.nextSibling);
      }

      // 添加评论区域
      if (itemData.key && window.commentsJsLoad) {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'shuoshuo-comment no-comment';
        commentDiv.setAttribute('data-key', itemData.key);
        shuoshuoItem.appendChild(commentDiv);
      }
    }
  }

  function initShuoshuoEncrypt() {
    // 查找所有shuoshuo加密容器
    const containers = document.querySelectorAll('[id^="shuoshuo-encrypt-"]');
    
    containers.forEach(container => {
      const dataElement = container.querySelector('script[type="hbeData"]');
      if (!dataElement) return;
      
      const encryptedData = dataElement.innerText;
      const hmacDigest = dataElement.dataset['hmacdigest'];
      
      container.addEventListener('keydown', async (event) => {
        if (event.isComposing || event.keyCode === 13) {
          const passwordInput = container.querySelector('input[type="password"]');
          if (!passwordInput) return;
          
          const password = passwordInput.value;
          const keyMaterial = await getKeyMaterial(password);
          const hmacKey = await getHmacKey(keyMaterial);
          const decryptKey = await getDecryptKey(keyMaterial);
          const iv = await getIv(keyMaterial);

          decrypt(decryptKey, iv, hmacKey, encryptedData, hmacDigest, container).then((result) => {
            console.log(`Decrypt result: ${result}`);
            if (!result) {
              showCuteNotification('', '哒咩 ~ 主人不让我告诉你捏', 'warning');
            }
          });
        }
      });
    });
  }

  // 初始化函数
  function init() {
    // 如果页面中有shuoshuo加密容器，则初始化
    if (document.querySelector('[id^="shuoshuo-encrypt-"]')) {
      initShuoshuoEncrypt();
    }
  }

  // 页面加载完成后初始化
  if (window.pjax) {
    document.addEventListener('pjax:complete', init);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
  
  // 如果页面已经加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 萌化通知函数 - 模仿custom.js的风格
  function showCuteNotification(title, message, type = 'info') {
    // 检查是否有Vue实例和$notify方法
    if (typeof Vue !== 'undefined' && window.app && window.app.$notify) {
      window.app.$notify({
        title: title,
        message: message,
        position: "top-right",
        offset: 50,
        showClose: true,
        type: type,
        duration: 3000
      });
    } else {
      // 如果没有Vue通知系统，创建一个简单的通知
      createSimpleNotification(title, message, type);
    }
  }

  // 简单通知函数（备用方案）
  function createSimpleNotification(title, message, type) {
    const notification = document.createElement('div');
    notification.className = `cute-notification cute-notification-${type}`;

    // 根据类型选择图标和颜色
    const iconMap = {
      'success': { icon: '✓', color: '#10b981', bgColor: '#ecfdf5' },
      'error': { icon: '✗', color: '#ef4444', bgColor: '#fef2f2' },
      'warning': { icon: '!', color: '#f59e0b', bgColor: '#fffbeb' }
    };

    const config = iconMap[type] || iconMap['success'];

    notification.innerHTML = `
      <div class="cute-notification-icon">${config.icon}</div>
      <div class="cute-notification-content">
        <div class="cute-notification-title">${title}</div>
        ${message ? `<div class="cute-notification-message">${message}</div>` : ''}
      </div>
      <button class="cute-notification-close">×</button>
    `;

    // 添加样式
    notification.style.cssText = `
      position: fixed;
      top: 50px;
      right: 20px;
      background: ${config.bgColor};
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      padding: 16px 20px;
      max-width: 320px;
      min-width: 280px;
      z-index: 9999;
      border-left: 4px solid ${config.color};
      animation: slideInRight 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.2);
    `;

    // 添加动画样式
    if (!document.querySelector('#cute-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'cute-notification-styles';
      style.textContent = `
        @keyframes slideInRight {
          from {
            transform: translateX(100%) scale(0.9);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }

        @keyframes fadeOut {
          from {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
          to {
            transform: translateX(100%) scale(0.9);
            opacity: 0;
          }
        }

        .cute-notification-icon {
          font-size: 18px;
          font-weight: bold;
          line-height: 1;
          flex-shrink: 0;
          margin-top: 2px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .cute-notification-success .cute-notification-icon {
          background: #10b981;
        }

        .cute-notification-error .cute-notification-icon {
          background: #ef4444;
        }

        .cute-notification-warning .cute-notification-icon {
          background: #f59e0b;
        }

        .cute-notification-content {
          flex: 1;
          min-width: 0;
        }

        .cute-notification-title {
          font-weight: 600;
          margin-bottom: 4px;
          color: #2c3e50;
          font-size: 15px;
          line-height: 1.4;
        }

        .cute-notification-message {
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
          margin: 0;
        }

        .cute-notification-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #94a3b8;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s ease;
          line-height: 1;
        }

        .cute-notification-close:hover {
          background: rgba(0,0,0,0.1);
          color: #64748b;
          transform: scale(1.1);
        }

        .cute-notification-success {
          border-left-color: #10b981 !important;
        }

        .cute-notification-error {
          border-left-color: #ef4444 !important;
        }

        .cute-notification-warning {
          border-left-color: #f59e0b !important;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // 关闭函数
    const closeNotification = () => {
      notification.style.animation = 'fadeOut 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    };

    // 关闭按钮事件
    notification.querySelector('.cute-notification-close').onclick = closeNotification;

    // 点击通知框也可以关闭
    notification.onclick = (e) => {
      if (e.target === notification || e.target.classList.contains('cute-notification-content')) {
        closeNotification();
      }
    };

    // 3秒后自动消失
    setTimeout(() => {
      if (notification.parentNode) {
        closeNotification();
      }
    }, 3000);
  }

})();
