/* global hexo */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// hexo-blog-encrypt扩展插件 - 支持shuoshuo页面和单条加密
// 完全继承原插件的样式和交互逻辑

const keySalt = textToArray('hexo-blog-encrypt的作者们都是大帅比!');
const ivSalt = textToArray('hexo-blog-encrypt是地表最强Hexo加密插件!');
const knownPrefix = "<hbe-prefix></hbe-prefix>";

// 1. 处理单条shuoshuo加密
hexo.extend.filter.register('before_generate', function() {
  const config = hexo.config.encrypt;
  
  if (!config || !config.shuoshuo || !config.shuoshuo.enable) {
    return;
  }

  const shuoshuoConfig = config.shuoshuo;
  const encryptedKeys = shuoshuoConfig.encrypted_keys || [];
  
  if (encryptedKeys.length === 0) {
    return;
  }

  // 处理shuoshuo数据中的加密条目
  processShuoshuoEncryption(shuoshuoConfig, encryptedKeys);
});

// 2. 支持shuoshuo页面整页加密
hexo.extend.filter.register('after_post_render', (data) => {
  // 检查是否是shuoshuo页面且设置了密码
  if (data.layout === 'shuoshuo' && data.password) {
    return encryptShuoshuoPage(data);
  }
  
  return data;
}, 1001); // 设置较低优先级，确保在原插件之后执行

// 处理单条shuoshuo加密
function processShuoshuoEncryption(shuoshuoConfig, encryptedKeys) {
  const shuoshuoPath = path.join(hexo.source_dir, '_data', 'shuoshuo.yml');
  
  if (!fs.existsSync(shuoshuoPath)) {
    hexo.log.warn('hexo-blog-encrypt-shuoshuo: shuoshuo.yml file not found');
    return;
  }

  try {
    const shuoshuoData = hexo.render.renderSync({ path: shuoshuoPath, engine: 'yaml' });
    
    if (!Array.isArray(shuoshuoData)) {
      hexo.log.warn('hexo-blog-encrypt-shuoshuo: shuoshuo.yml should contain an array');
      return;
    }

    let modified = false;
    
    // 加密指定的shuoshuo条目
    shuoshuoData.forEach(item => {
      if (encryptedKeys.includes(item.key) && !item.encrypted) {
        hexo.log.info(`hexo-blog-encrypt-shuoshuo: encrypting shuoshuo item with key: ${item.key}`);
        
        // 加密content
        const password = shuoshuoConfig.password;
        const encryptedContent = encryptShuoshuoItem(item.content, password);
        
        // 标记为已加密并保存加密数据
        item.encrypted = true;
        item.original_content = item.content; // 备份原始内容
        item.encrypted_data = encryptedContent.data;
        item.hmac_digest = encryptedContent.hmac;
        item.encrypt_config = {
          theme: hexo.config.encrypt.theme || 'xray',
          message: hexo.config.encrypt.message || '您好, 这里需要密码.',
          wrong_pass_message: hexo.config.encrypt.wrong_pass_message || '抱歉, 这个密码看着不太对, 请再试试.',
          wrong_hash_message: hexo.config.encrypt.wrong_hash_message || '抱歉, 这个文章不能被校验, 不过您还是能看看解密后的内容.'
        };
        
        modified = true;
      }
    });

    if (modified) {
      // 将修改后的数据写回到hexo的数据中
      hexo.locals.set('data', Object.assign(hexo.locals.get('data') || {}, {
        shuoshuo: shuoshuoData
      }));
    }
    
  } catch (error) {
    hexo.log.error('hexo-blog-encrypt-shuoshuo: Error processing shuoshuo.yml:', error);
  }
}

// 加密shuoshuo页面
function encryptShuoshuoPage(data) {
  const config = Object.assign({
    'abstract': 'Here\'s something encrypted, password is required to continue reading.',
    'message': 'Hey, password is required here.',
    'theme': 'default',
    'wrong_pass_message': 'Oh, this is an invalid password. Check and try again, please.',
    'wrong_hash_message': 'OOPS, these decrypted content may changed, but you can still have a look.',
  }, hexo.config.encrypt, data);

  const password = data.password.toString();
  const theme = config.theme.trim().toLowerCase();
  
  // 读取模板
  const templatePath = path.resolve(__dirname, '../node_modules/hexo-blog-encrypt/lib', `hbe.${theme}.html`);
  let template;
  
  try {
    template = fs.readFileSync(templatePath).toString();
  } catch (error) {
    hexo.log.warn(`hexo-blog-encrypt-shuoshuo: Template ${theme} not found, using default`);
    template = fs.readFileSync(path.resolve(__dirname, '../node_modules/hexo-blog-encrypt/lib/hbe.default.html')).toString();
  }

  // 加密内容
  data.origin = data.content;
  data.content = knownPrefix + data.content.trim();
  data.encrypt = true;

  const key = crypto.pbkdf2Sync(password, keySalt, 1024, 32, 'sha256');
  const iv = crypto.pbkdf2Sync(password, ivSalt, 512, 16, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const hmac = crypto.createHmac('sha256', key);

  let encryptedData = cipher.update(data.content, 'utf8', 'hex');
  hmac.update(data.content, 'utf8');
  encryptedData += cipher.final('hex');
  const hmacDigest = hmac.digest('hex');

  data.content = template.replace(/{{hbeEncryptedData}}/g, encryptedData)
    .replace(/{{hbeHmacDigest}}/g, hmacDigest)
    .replace(/{{hbeWrongPassMessage}}/g, config.wrong_pass_message)
    .replace(/{{hbeWrongHashMessage}}/g, config.wrong_hash_message)
    .replace(/{{hbeMessage}}/g, config.message);
    
  data.content += `<script data-pjax src="${hexo.config.root}lib/hbe.js"></script><link href="${hexo.config.root}css/hbe.style.css" rel="stylesheet" type="text/css">`;
  data.excerpt = data.more = config.abstract;

  hexo.log.info(`hexo-blog-encrypt-shuoshuo: encrypting shuoshuo page "${data.title.trim()}" with theme: ${theme}.`);
  
  return data;
}

// 加密单条shuoshuo内容
function encryptShuoshuoItem(content, password) {
  const contentToEncrypt = knownPrefix + content.trim();
  
  const key = crypto.pbkdf2Sync(password, keySalt, 1024, 32, 'sha256');
  const iv = crypto.pbkdf2Sync(password, ivSalt, 512, 16, 'sha256');
  
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const hmac = crypto.createHmac('sha256', key);
  
  let encryptedData = cipher.update(contentToEncrypt, 'utf8', 'hex');
  hmac.update(contentToEncrypt, 'utf8');
  encryptedData += cipher.final('hex');
  const hmacDigest = hmac.digest('hex');
  
  return {
    data: encryptedData,
    hmac: hmacDigest
  };
}

// 工具函数：文本转数组
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

// 生成器：确保shuoshuo解密脚本可访问
hexo.extend.generator.register('shuoshuo-decrypt-js', () => {
  const jsPath = path.join(hexo.theme_dir, 'source', 'js', 'shuoshuo-decrypt.js');

  if (fs.existsSync(jsPath)) {
    return {
      'data': () => fs.createReadStream(jsPath),
      'path': 'js/shuoshuo-decrypt.js',
    };
  }

  return null;
});
