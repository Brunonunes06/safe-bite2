// Configuração da API Nutri-Scan
const API_CONFIG = {
  baseURL: 'http://localhost:5000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
};

/**
 * Função utilitária de redirecionamento seguro
 * Pode ser sobrescrita por módulos específicos se necessário
 */
function safeRedirect(url) {
  // Valida e redireciona de forma segura
  if (!url) return;

  // Se há um fileChecker com método especializado, delegar a ele (mantém compatibilidade)
  if (window.fileChecker && typeof window.fileChecker.safeRedirectTo === 'function') {
    try {
      window.fileChecker.safeRedirectTo(url);
      return;
    } catch (e) {
      console.warn('fileChecker.safeRedirectTo falhou, fallback para window.location:', e);
    }
  }

  // Se a URL começa com http, validar o domínio
  try {
    if (url.startsWith('http')) {
      const currentDomain = window.location.hostname;
      const urlObj = new URL(url);
      if (urlObj.hostname !== currentDomain) {
        console.warn('Redirecionamento bloqueado para domínio externo:', url);
        return;
      }
    }
  } catch (e) {
    console.warn('URL inválida passada para safeRedirect:', url, e);
    return;
  }

  // Redirecionamento seguro
  window.location.href = url;
}

// Classe para comunicação com a API
class NutriScanAPI {
  constructor() {
    this.baseURL = API_CONFIG.baseURL;
    this.token = localStorage.getItem('nutriScanToken');
  }

  // Método genérico para requisições
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        ...API_CONFIG.headers,
        ...(this.token && { Authorization: `Bearer ${this.token}` })
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro na requisição');
      }

      return await response.json();
    } catch (error) {
      console.error('Erro na API:', error);
      console.log('Servidor não disponível, usando modo simulado');
      
      // Fallback para modo simulado quando servidor não está disponível
      return this.getSimulatedResponse(endpoint, options);
    }
  }

  // Métodos HTTP
  async get(endpoint) {
    return this.request(endpoint);
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }

  // Upload de arquivos
  async upload(endpoint, file) {
    const formData = new FormData();
    formData.append('image', file);

    const config = {
      method: 'POST',
      body: formData,
      headers: {
        ...(this.token && { Authorization: `Bearer ${this.token}` })
      }
    };

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro no upload');
      }

      return await response.json();
    } catch (error) {
      console.error('Erro no upload:', error);
      throw error;
    }
  }

  // Autenticação
  async login(email, password) {
    const result = await this.post('/auth/login', { email, password });
    if (result.token) {
      this.token = result.token;
      localStorage.setItem('nutriScanToken', result.token);
    }
    return result;
  }

  async register(userData) {
    return this.post('/auth/register', userData);
  }

  async logout() {
    try {
      await this.get('/auth/logout');
    } finally {
      this.token = null;
      localStorage.removeItem('nutriScanToken');
    }
  }

  async getCurrentUser() {
    return this.get('/auth/me');
  }

  // Usuários
  async getDashboard() {
    return this.get('/users/dashboard');
  }

  async getProfile() {
    return this.get('/users/profile');
  }

  async updateProfile(data) {
    return this.put('/users/profile', data);
  }

  async getScans(page = 1, limit = 10) {
    return this.get(`/users/scans?page=${page}&limit=${limit}`);
  }

  // Scans
  async createScan(file) {
    return this.upload('/scans', file);
  }

  async getScan(id) {
    return this.get(`/scans/${id}`);
  }

  async getScanStats() {
    return this.get('/scans/stats');
  }

  // Produtos
  async getProducts(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    return this.get(`/products?${params}`);
  }

  async getProduct(id) {
    return this.get(`/products/${id}`);
  }

  async getProductByBarcode(barcode) {
    return this.get(`/products/barcode/${barcode}`);
  }

  // Assinaturas
  async getPlans() {
    return this.get('/subscriptions/plans');
  }

  async getSubscriptionStatus() {
    return this.get('/subscriptions/status');
  }

  async createCheckoutSession(planId) {
    return this.post('/subscriptions/create-checkout-session', { planId });
  }

  // Health check
  async healthCheck() {
    return this.get('/health');
  }
}

// Instância global da API
let api;
if (typeof NutriScanAPI !== 'undefined') {
  api = new NutriScanAPI();
} else {
  console.warn('NutriScanAPI não encontrada para instância global');
  api = null;
}

// Funções utilitárias
const APIUtils = {
  // Tratamento de erros
  handleError(error, customMessage = null) {
    console.error('Erro da API:', error);
    
    if (customMessage) {
      return customMessage;
    }
    
    if (error.message.includes('Failed to fetch')) {
      return 'Erro de conexão. Verifique se o servidor está rodando.';
    }
    
    if (error.message.includes('401')) {
      return 'Sessão expirada. Faça login novamente.';
    }
    
    if (error.message.includes('403')) {
      return 'Acesso negado.';
    }
    
    if (error.message.includes('404')) {
      return 'Recurso não encontrado.';
    }
    
    if (error.message.includes('429')) {
      return 'Muitas requisições. Tente novamente mais tarde.';
    }
    
    return error.message || 'Ocorreu um erro. Tente novamente.';
  },

  // Verificar se usuário está autenticado
  isAuthenticated() {
    return !!localStorage.getItem('nutriScanToken');
  },

  // Redirecionar para login
  redirectToLogin() {
    localStorage.removeItem('nutriScanToken');
    window.location.hash = 'login';
  },

  // Redirecionar para dashboard
  redirectToDashboard() {
    window.location.hash = 'dashboard';
  },

  // Formatar data
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  },

  // Formatar hora
  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // Método para fornecer respostas simuladas quando servidor não está disponível
  getSimulatedResponse(endpoint, options = {}) {
    console.log('Gerando resposta simulada para:', endpoint);
    
    // Simular delay de rede
    return new Promise((resolve) => {
      setTimeout(() => {
        const user = JSON.parse(localStorage.getItem('nutriScanUser') || '{}');
        
        switch (endpoint) {
          case '/auth/google':
            resolve({
              success: true,
              user: {
                id: user.id || '1',
                name: user.name || 'Bruno Teste',
                email: user.email || 'bruno.teste@example.com',
                plan: user.plan || 'Free',
                profileImage: user.profileImage || null
              },
              token: 'simulated-token-' + Date.now()
            });
            break;
            
          case '/auth/login':
            resolve({
              success: true,
              user: {
                id: user.id || '1',
                name: user.name || 'Bruno Teste',
                email: user.email || 'bruno.teste@example.com',
                plan: user.plan || 'Free',
                profileImage: user.profileImage || null
              },
              token: 'simulated-token-' + Date.now()
            });
            break;
            
          case '/auth/register':
            resolve({
              success: true,
              user: {
                id: '1',
                name: options.body?.name || 'Novo Usuário',
                email: options.body?.email || 'usuario@example.com',
                plan: 'Free',
                profileImage: null
              },
              token: 'simulated-token-' + Date.now()
            });
            break;
            
          case '/user/profile':
            resolve({
              success: true,
              user: user || {
                id: '1',
                name: 'Bruno Teste',
                email: 'bruno.teste@example.com',
                plan: 'Free',
                profileImage: null
              }
            });
            break;
            
          case '/user/update':
            resolve({
              success: true,
              user: {
                ...user,
                ...options.body
              }
            });
            break;
            
          case '/scans':
            resolve({
              success: true,
              scans: JSON.parse(localStorage.getItem('nutriScanScans') || '[]')
            });
            break;
            
          case '/scans/save':
            const scans = JSON.parse(localStorage.getItem('nutriScanScans') || '[]');
            const newScan = {
              id: Date.now().toString(),
              ...options.body,
              date: new Date().toISOString()
            };
            scans.push(newScan);
            localStorage.setItem('nutriScanScans', JSON.stringify(scans));
            resolve({
              success: true,
              scan: newScan
            });
            break;
            
          default:
            resolve({
              success: true,
              message: 'Operação simulada concluída'
            });
        }
      }, 500); // Simular delay de 500ms
    });
  }
};
// Sistema de Monitoramento Contínuo de Autenticação
// Safe-Bite Authentication Monitor

class AuthMonitor {
  constructor() {
    this.isLoggedIn = false;
    this.currentUser = null;
    this.checkInterval = null;
    this.lastActivity = Date.now();
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutos
    this.checkFrequency = 5000; // 5 segundos
    this.listeners = new Map();
    
    this.init();
  }

  init() {
    console.log('🔐 Iniciando sistema de monitoramento de autenticação');
    
    // Verificar status inicial
    this.checkAuthStatus();
    
    // Iniciar verificação periódica
    this.startPeriodicCheck();
    
    // Configurar listeners de eventos
    this.setupEventListeners();
    
    // Configurar listener de storage
    this.setupStorageListener();
    
    // Configurar listener de visibilidade da página
    this.setupVisibilityListener();
  }

  // Verificar status atual da autenticação
  checkAuthStatus() {
    const token = localStorage.getItem('nutriScanToken');
    const user = localStorage.getItem('nutriScanUser');
    const wasLoggedIn = this.isLoggedIn;
    
    this.isLoggedIn = !!(token && user);
    this.currentUser = user ? JSON.parse(user) : null;
    
    // Se o status mudou, notificar
    if (wasLoggedIn !== this.isLoggedIn) {
      this.notifyAuthChange();
    }
    
    // Atualizar UI imediatamente
    this.updateAuthUI();
    
    return this.isLoggedIn;
  }

  // Iniciar verificação periódica
  startPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(() => {
      this.checkAuthStatus();
      this.checkSessionTimeout();
    }, this.checkFrequency);
    
    console.log(`⏰ Verificação contínua iniciada (${this.checkFrequency/1000}s)`);
  }

  // Configurar listeners de eventos
  setupEventListeners() {
    // Monitorar atividade do usuário
    const events = [
      'mousedown', 'mousemove', 'keypress', 'scroll', 
      'touchstart', 'click', 'keydown', 'keyup'
    ];
    
    events.forEach(event => {
      document.addEventListener(event, () => {
        this.updateLastActivity();
      }, { passive: true });
    });
    
    console.log('👆 Listeners de atividade configurados');
  }

  // Configurar listener de storage (mudanças entre abas)
  setupStorageListener() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'nutriScanToken' || e.key === 'nutriScanUser') {
        console.log('🔄 Mudança de autenticação detectada (outra aba)');
        setTimeout(() => {
          this.checkAuthStatus();
        }, 100);
      }
    });
    
    console.log('📦 Listener de storage configurado');
  }

  // Configurar listener de visibilidade da página
  setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        console.log('👁️ Página ficou visível, verificando autenticação');
        this.checkAuthStatus();
      }
    });
    
    console.log('👁️ Listener de visibilidade configurado');
  }

  // Atualizar última atividade
  updateLastActivity() {
    this.lastActivity = Date.now();
    localStorage.setItem('lastActivity', this.lastActivity.toString());
  }

  // Verificar timeout da sessão
  checkSessionTimeout() {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;
    
    if (timeSinceActivity > this.sessionTimeout && this.isLoggedIn) {
      console.log('⏰ Sessão expirada por inatividade');
      this.logout('Sessão expirada por inatividade');
    }
  }

  // Notificar mudanças de autenticação
  notifyAuthChange() {
    const status = this.isLoggedIn;
    const user = this.currentUser;
    
    console.log(`🔔 Status de autenticação mudou: ${status ? 'LOGADO' : 'DESLOGADO'}`);
    
    // Disparar eventos para listeners
    this.listeners.forEach((callback, event) => {
      try {
        callback({ status, user, timestamp: Date.now() });
      } catch (error) {
        console.error('Erro no listener de autenticação:', error);
      }
    });
    
    // Mostrar notificação visual
    this.showAuthNotification(status);
    
    // Atualizar indicadores visuais
    this.updateAuthIndicators(status);
  }

  // Mostrar notificação de autenticação
  showAuthNotification(isLoggedIn) {
    if (isLoggedIn) {
      this.showNotification('✅ Você está logado', 'success', {
        duration: 3000,
        icon: 'user-check'
      });
    } else {
      this.showNotification('🔒 Você não está logado', 'warning', {
        duration: 5000,
        icon: 'user-slash',
        actions: [
          {
            text: 'Fazer Login',
            icon: 'sign-in-alt',
            onClick: 'window.location.hash = "login"'
          }
        ]
      });
    }
  }

  // Atualizar UI de autenticação
  updateAuthUI() {
    this.updateAuthIndicators(this.isLoggedIn);
    this.updatePlanStatus();
    this.updateUserInterface();
  }

  // Atualizar indicadores de autenticação
  updateAuthIndicators(isLoggedIn) {
    // Atualizar botão do dashboard
    const dashboardLink = document.getElementById('dashboardLink');
    if (dashboardLink) {
      if (isLoggedIn) {
        dashboardLink.style.color = '#2ecc71';
        dashboardLink.innerHTML = '<i class="fas fa-tachometer-alt"></i> Dashboard';
      } else {
        dashboardLink.style.color = '#e74c3c';
        dashboardLink.innerHTML = '<i class="fas fa-lock"></i> Dashboard';
      }
    }
    
    // Atualizar elementos de status
    const statusElements = document.querySelectorAll('.auth-status');
    statusElements.forEach(element => {
      element.textContent = isLoggedIn ? 'Conectado' : 'Desconectado';
      element.className = `auth-status ${isLoggedIn ? 'online' : 'offline'}`;
    });
  }

  // Atualizar status do plano
  updatePlanStatus() {
    const planElements = document.querySelectorAll('.plan-status');
    const user = this.currentUser;
    
    if (!planElements.length || !user) return;
    
    const planName = user.subscription?.plan || 'Free';
    const planStatus = user.subscription?.status || 'active';
    
    planElements.forEach(element => {
      element.innerHTML = `
        <span class="plan-name">${planName}</span>
        <span class="plan-indicator ${planStatus}"></span>
      `;
    });
  }

  // Atualizar interface do usuário
  updateUserInterface() {
    const user = this.currentUser;
    
    // Atualizar informações do usuário na interface
    const userElements = document.querySelectorAll('.user-info');
    userElements.forEach(element => {
      if (user) {
        element.innerHTML = `
          <div class="user-avatar">
            ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : 
              '<i class="fas fa-user"></i>'}
          </div>
          <div class="user-details">
            <div class="user-name">${user.name}</div>
            <div class="user-email">${user.email}</div>
          </div>
        `;
      } else {
        element.innerHTML = `
          <div class="login-prompt" style="cursor: pointer;">
            <i class="fas fa-user-slash"></i>
            <span>Faça login para continuar</span>
          </div>
        `;
        
        // Adicionar evento de clique
        const loginPrompt = element.querySelector('.login-prompt');
        if (loginPrompt) {
          loginPrompt.addEventListener('click', () => {
            window.location.hash = 'login';
          });
        }
      }
    });
  }

  // Adicionar listener de eventos de autenticação
  onAuthChange(callback) {
    const id = Date.now().toString();
    this.listeners.set(id, callback);
    return id;
  }

  // Remover listener de eventos
  removeAuthListener(id) {
    this.listeners.delete(id);
  }

  // Logout
  logout(reason = 'Logout manual') {
    console.log(`🚪 Logout: ${reason}`);
    
    // Limpar dados de autenticação
    localStorage.removeItem('nutriScanToken');
    localStorage.removeItem('nutriScanUser');
    localStorage.removeItem('lastActivity');
    
    // Atualizar status
    this.isLoggedIn = false;
    this.currentUser = null;
    
    // Notificar mudança
    this.notifyAuthChange();
    
    // Redirecionar se não estiver na página de login
    if (window.location.hash !== '#login') {
      setTimeout(() => {
        window.location.hash = 'login';
      }, 1000);
    }
  }

  // Forçar verificação manual
  forceCheck() {
    console.log('🔍 Verificação manual forçada');
    this.checkAuthStatus();
  }

  // Obter status atual
  getStatus() {
    return {
      isLoggedIn: this.isLoggedIn,
      user: this.currentUser,
      lastActivity: this.lastActivity,
      sessionTimeLeft: Math.max(0, this.sessionTimeout - (Date.now() - this.lastActivity))
    };
  }

  // Mostrar notificação genérica
  showNotification(message, type = 'info', options = {}) {
    // Reutilizar função de notificação se existir
    if (typeof showNotification === 'function') {
      showNotification(message, type, options);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  // Destruir monitor
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.listeners.clear();
    console.log('🗑️ Monitor de autenticação destruído');
  }
}

// Criar instância global
let authMonitor;

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  authMonitor = new AuthMonitor();
  
  // Tornar globalmente acessível
  window.authMonitor = authMonitor;
  
  console.log('✅ Sistema de monitoramento de autenticação carregado');
});

// Exportar para uso global
window.AuthMonitor = AuthMonitor;
// Sistema de Dark Mode
// Safe-Bite Theme Manager

class DarkModeManager {
  constructor() {
    this.isDarkMode = false;
    this.userPreference = null;
    this.systemPreference = null;
    // this.init();
  }

  init() {
    console.log('🌙 Iniciando sistema de dark mode');
    
    // Carregar preferências salvas
    this.loadPreferences();
    
    // Detectar preferência do sistema
    this.detectSystemPreference();
    
    // Aplicar tema inicial
    this.applyTheme(this.getEffectiveTheme());
    
    // Configurar listeners
    this.setupEventListeners();
    
    // Adicionar toggle de tema
    // this.addThemeToggle();
  }

  // Carregar preferências do usuário
  loadPreferences() {
    this.userPreference = localStorage.getItem('darkModePreference');
  }

  // Salvar preferência do usuário
  saveUserPreference(preference) {
    this.userPreference = preference;
    localStorage.setItem('darkModePreference', preference);
  }

  // Detectar preferência do sistema
  detectSystemPreference() {
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemPreference = darkModeQuery.matches ? 'dark' : 'light';
      
      // Ouvir mudanças na preferência do sistema
      darkModeQuery.addEventListener('change', (e) => {
        this.systemPreference = e.matches ? 'dark' : 'light';
        if (this.userPreference === null) {
          this.applyTheme(this.getEffectiveTheme());
        }
      });
    }
  }

  // Obter tema efetivo
  getEffectiveTheme() {
    // Prioridade: preferência do usuário > preferência do sistema > light
    return this.userPreference || this.systemPreference || 'light';
  }

  // Aplicar tema
  applyTheme(theme) {
    this.isDarkMode = theme === 'dark';
    
    // Atualizar CSS variables
    this.updateCSSVariables(theme);
    
    // Atualizar atributos HTML
    document.documentElement.setAttribute('data-theme', theme);
    
    // Atualizar classes
    document.body.classList.toggle('dark-mode', this.isDarkMode);
    
    // Atualizar toggle
    this.updateThemeToggle();
    
    // Disparar evento de mudança de tema
    this.dispatchThemeChange(theme);
    
    console.log(`🎨 Tema aplicado: ${theme}`);
  }

  // Atualizar variáveis CSS
  updateCSSVariables(theme) {
    const root = document.documentElement;
    
    if (theme === 'dark') {
      root.style.setProperty('--bg-primary', '#1a1a1a');
      root.style.setProperty('--bg-secondary', '#2d2d2d');
      root.style.setProperty('--bg-card', '#3a3a3a');
      root.style.setProperty('--text-primary', '#ffffff');
      root.style.setProperty('--text-secondary', '#b0b0b0');
      root.style.setProperty('--text-muted', '#808080');
      root.style.setProperty('--border-color', '#404040');
      root.style.setProperty('--shadow-color', 'rgba(0, 0, 0, 0.3)');
      root.style.setProperty('--accent-primary', '#4ecdc4');
      root.style.setProperty('--accent-secondary', '#45a049');
      root.style.setProperty('--success-green', '#27ae60');
      root.style.setProperty('--warning-yellow', '#f39c12');
      root.style.setProperty('--danger-red', '#e74c3c');
      root.style.setProperty('--info-blue', '#3498db');
    } else {
      root.style.setProperty('--bg-primary', '#ffffff');
      root.style.setProperty('--bg-secondary', '#f8f9fa');
      root.style.setProperty('--bg-card', '#ffffff');
      root.style.setProperty('--text-primary', '#2c3e50');
      root.style.setProperty('--text-secondary', '#6c757d');
      root.style.setProperty('--text-muted', '#95a5a6');
      root.style.setProperty('--border-color', '#e9ecef');
      root.style.setProperty('--shadow-color', 'rgba(0, 0, 0, 0.1)');
      root.style.setProperty('--accent-primary', '#2ecc71');
      root.style.setProperty('--accent-secondary', '#27ae60');
      root.style.setProperty('--success-green', '#2ecc71');
      root.style.setProperty('--warning-yellow', '#f39c12');
      root.style.setProperty('--danger-red', '#e74c3c');
      root.style.setProperty('--info-blue', '#3498db');
    }
  }

  // Configurar listeners de eventos
  setupEventListeners() {
    // Listener de mudança de tema customizado
    document.addEventListener('themechange', (e) => {
      this.applyTheme(e.detail.theme);
    });
    
    // Atalho de teclado para alternar tema (Ctrl/Cmd + Shift + D)
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && e.key === 'D') {
        e.preventDefault();
        this.toggleTheme();
      }
    });
    
    console.log('⌨️ Atalhos de tema configurados');
  }

  // Adicionar botão de toggle
  // addThemeToggle() {
  //   const toggle = document.createElement('div');
  //   toggle.className = 'theme-toggle';
  //   toggle.innerHTML = `
  //     <button class="theme-toggle-btn" id="themeToggleBtn" title="Alternar tema (Ctrl+Shift+D)">
  //       <i class="fas fa-${this.isDarkMode ? 'sun' : 'moon'}"></i>
  //     </button>
  //   `;
    
  //   // Adicionar ao header
  //   const header = document.querySelector('.header-content');
  //   if (header) {
  //     header.appendChild(toggle);
  //   }
    
  //   // Configurar evento de clique
  //   const toggleBtn = document.getElementById('themeToggleBtn');
  //   if (toggleBtn) {
  //     toggleBtn.addEventListener('click', () => this.toggleTheme());
  //   }
  // }

  // Atualizar botão de toggle
  updateThemeToggle() {
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.className = `fas fa-${this.isDarkMode ? 'sun' : 'moon'}`;
      }
      toggleBtn.title = this.isDarkMode ? 
        'Ativar modo claro (Ctrl+Shift+D)' : 
        'Ativar modo escuro (Ctrl+Shift+D)';
    }
  }

  // Alternar tema
  toggleTheme() {
    const newTheme = this.isDarkMode ? 'light' : 'dark';
    this.saveUserPreference(newTheme);
    this.applyTheme(newTheme);
  }

  // Disparar evento de mudança de tema
  dispatchThemeChange(theme) {
    const event = new CustomEvent('themechange', {
      detail: { theme, isDarkMode: theme === 'dark' }
    });
    document.dispatchEvent(event);
  }

  // Obter status atual
  getStatus() {
    return {
      isDarkMode: this.isDarkMode,
      currentTheme: this.getEffectiveTheme(),
      userPreference: this.userPreference,
      systemPreference: this.systemPreference
    };
  }

  // Definir tema manualmente
  setTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
      this.saveUserPreference(theme);
      this.applyTheme(theme);
    }
  }

  // Resetar para preferência do sistema
  resetToSystemPreference() {
    this.userPreference = null;
    localStorage.removeItem('darkModePreference');
    this.applyTheme(this.getEffectiveTheme());
  }

  // Destruir
  destroy() {
    // Remover listeners se necessário
    console.log('🗑️ Sistema de dark mode desativado');
  }
}

// Criar instância global
let darkModeManager;

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  darkModeManager = new DarkModeManager();
  
  // Tornar globalmente acessível
  window.darkModeManager = darkModeManager;
  
  console.log('✅ Sistema de dark mode carregado');
});

// Exportar para uso global
window.DarkModeManager = DarkModeManager;
// Sistema de Login Completo - Nutri-Scan
// Gerencia login, cadastro e autenticação Google

class LoginSystem {
  constructor() {
    // Verificar se NutriScanAPI está disponível
    if (typeof NutriScanAPI !== 'undefined') {
      this.api = new NutriScanAPI();
    } else {
      console.warn('NutriScanAPI não encontrada, usando modo simulado');
      this.api = null;
    }
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkExistingSession();
  }

  setupEventListeners() {
    // Formulário de login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Verificar se estamos na página de login
    if (window.location.hash.includes('login')) {
      this.setupLoginPage();
    }
  }

  setupLoginPage() {
    // Adicionar validação em tempo real
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    if (emailInput) {
      emailInput.addEventListener('blur', () => this.validateEmail(emailInput));
    }

    if (passwordInput) {
      passwordInput.addEventListener('input', () => this.validatePassword(passwordInput));
    }
  }

  checkExistingSession() {
    const token = localStorage.getItem('nutriScanToken');
    const user = localStorage.getItem('nutriScanUser');

    if (token && user) {
      // Usuário já está logado, redirecionar para dashboard
      if (window.location.hash === '#login' || 
          window.location.hash === '' || window.location.hash === '#home') {
        window.location.hash = 'dashboard';
      }
    }
  }

  async handleLogin(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const email = formData.get('email');
    const password = formData.get('password');
    const rememberMe = formData.get('rememberMe');

    // Validação
    if (!this.validateLoginForm(email, password)) {
      return;
    }

    // Mostrar loading
    this.setLoadingState(true);
    this.hideMessages();

    try {
      // Tentar fazer login, mas usar modo simulado se falhar
      let result;
      try {
        result = await this.api.login(email, password);
      } catch (apiError) {
        // Se falhar a conexão com o servidor, usar modo simulado
        console.log('Servidor não disponível, usando modo simulado para login');
        
        // Verificar se existe usuário cadastrado no localStorage
        const registeredUsers = JSON.parse(localStorage.getItem('nutriScanRegisteredUsers') || '[]');
        const foundUser = registeredUsers.find(u => u.email === email);
        
        if (foundUser && foundUser.password === password) {
          result = {
            success: true,
            token: 'simulated_token_' + Date.now(),
            user: {
              _id: foundUser.id,
              userId: foundUser.id,
              email: foundUser.email,
              name: foundUser.name,
              subscription: foundUser.subscription || {
                plan: 'free',
                status: 'active',
                startDate: new Date(),
                scansUsed: 0,
                scansLimit: 10
              },
              preferences: foundUser.preferences || {
                allergies: [],
                dietaryRestrictions: [],
                notifications: true,
                language: 'pt-BR'
              }
            }
          };
        } else if (email === 'demo@nutriscan.com' && password === 'demo123') {
          // Usuário demo para testes
          result = {
            success: true,
            token: 'simulated_token_' + Date.now(),
            user: {
              _id: 'demo_user',
              userId: 'demo_user',
              email: email,
              name: 'Usuário Demo',
              subscription: {
                plan: 'free',
                status: 'active',
                startDate: new Date(),
                scansUsed: 0,
                scansLimit: 10
              },
              preferences: {
                allergies: [],
                dietaryRestrictions: [],
                notifications: true,
                language: 'pt-BR'
              }
            }
          };
        } else {
          throw new Error('Email ou senha inválidos. Verifique seus dados ou crie uma conta.');
        }
      }
      
      if (result.success) {
        // Salvar dados do usuário
        localStorage.setItem('nutriScanToken', result.token);
        localStorage.setItem('nutriScanUser', JSON.stringify(result.user));
        localStorage.setItem('lastActivity', Date.now().toString());

        // Atualizar sistema de sincronização se presente
        try {
          if (window.userSync && typeof window.userSync.updateUser === 'function') {
            window.userSync.updateUser(result.user);
          }
          if (window.authMonitor && typeof window.authMonitor.checkAuthStatus === 'function') {
            window.authMonitor.checkAuthStatus();
          }
        } catch (e) {
          console.warn('Não foi possível atualizar userSync/authMonitor imediatamente:', e);
        }

        // Lembrar-me
        if (rememberMe) {
          localStorage.setItem('nutriScanRemember', 'true');
        } else {
          localStorage.removeItem('nutriScanRemember');
        }

        // Mostrar sucesso
        this.showSuccess('Login realizado com sucesso! Redirecionando...');

        // Redirecionar
        setTimeout(() => {
          const redirectUrl = this.getRedirectUrl();
          window.location.hash = redirectUrl.startsWith('#') ? redirectUrl : '#' + redirectUrl;
        }, 1500);
      } else {
        throw new Error(result.message || 'Erro no login');
      }
    } catch (error) {
      console.error('Erro no login:', error);
      this.showError(error.message || 'Erro ao fazer login. Tente novamente.');
    } finally {
      this.setLoadingState(false);
    }
  }

  async handleGoogleLogin() {
    this.setLoadingState(true);
    this.hideMessages();

    try {
      // Simular login Google (em produção, usaria Google Sign-In API)
      const googleUser = await this.simulateGoogleLogin();
      
      // Tentar enviar para backend, mas usar modo simulado se falhar
      let result;
      try {
        result = await this.api.post('/auth/google-login', {
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          googleId: googleUser.id
        });
      } catch (apiError) {
        // Se falhar a conexão com o servidor, usar modo simulado
        console.log('Servidor não disponível, usando modo simulado');
        result = {
          success: true,
          token: 'simulated_token_' + Date.now(),
          user: {
            _id: 'user_' + Date.now(),
            userId: 'user_' + Date.now(),
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture,
            subscription: {
              plan: 'free',
              status: 'active',
              startDate: new Date(),
              scansUsed: 0,
              scansLimit: 10
            },
            preferences: {
              allergies: [],
              dietaryRestrictions: [],
              notifications: true,
              language: 'pt-BR'
            }
          }
        };
      }

      if (result.success) {
        // Salvar dados
        localStorage.setItem('nutriScanToken', result.token);
        localStorage.setItem('nutriScanUser', JSON.stringify(result.user));

        // Atualizar sistema de sincronização se presente
        try {
          if (window.userSync && typeof window.userSync.updateUser === 'function') {
            window.userSync.updateUser(result.user);
          }
          if (window.authMonitor && typeof window.authMonitor.checkAuthStatus === 'function') {
            window.authMonitor.checkAuthStatus();
          }
        } catch (e) {
          console.warn('Não foi possível atualizar userSync/authMonitor imediatamente:', e);
        }

        this.showSuccess('Login com Google realizado com sucesso!');

        setTimeout(() => {
          const redirectUrl = this.getRedirectUrl();
          window.location.hash = redirectUrl.startsWith('#') ? redirectUrl : '#' + redirectUrl;
        }, 1500);
      } else {
        throw new Error(result.message || 'Erro no login Google');
      }
    } catch (error) {
      console.error('Erro no login Google:', error);
      this.showError(error.message || 'Erro ao fazer login com Google.');
    } finally {
      this.setLoadingState(false);
    }
  }

  async simulateGoogleLogin() {
    // Simular resposta do Google Sign-In
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          email: 'usuario@gmail.com',
          name: 'Usuário Teste',
          picture: 'https://lh3.googleusercontent.com/a/default-user',
          id: 'google_' + Date.now()
        });
      }, 1000);
    });
  }

  validateLoginForm(email, password) {
    let isValid = true;

    // Validar email
    if (!this.isValidEmail(email)) {
      this.showError('Por favor, insira um email válido.');
      isValid = false;
    }

    // Validar senha
    if (!password || password.length < 6) {
      this.showError('A senha deve ter pelo menos 6 caracteres.');
      isValid = false;
    }

    return isValid;
  }

  validateEmail(input) {
    const email = input.value.trim();
    const isValid = this.isValidEmail(email);

    if (!isValid && email) {
      input.style.borderColor = '#e74c3c';
      this.showError('Por favor, insira um email válido.');
    } else {
      input.style.borderColor = '';
      this.hideMessages();
    }

    return isValid;
  }

  validatePassword(input) {
    const password = input.value;
    
    if (password.length > 0 && password.length < 6) {
      input.style.borderColor = '#e74c3c';
      this.showError('A senha deve ter pelo menos 6 caracteres.');
    } else {
      input.style.borderColor = '';
      this.hideMessages();
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  setLoadingState(loading) {
    const loginBtn = document.getElementById('loginBtn');
    const googleBtn = document.querySelector('.google-login-btn');

    if (loading) {
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
      }
      if (googleBtn) {
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
      }
    } else {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
      }
      if (googleBtn) {
        googleBtn.disabled = false;
        googleBtn.innerHTML = '<img src="https://developers.google.com/identity/images/g-logo.png" alt="Google"><span>Continuar com Google</span>';
      }
    }
  }

  showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    this.hideSuccess();
  }

  showSuccess(message) {
    const successElement = document.getElementById('successMessage');
    if (successElement) {
      successElement.textContent = message;
      successElement.style.display = 'block';
    }
    this.hideError();
  }

  hideError() {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
      errorElement.style.display = 'none';
    }
  }

  hideSuccess() {
    const successElement = document.getElementById('successMessage');
    if (successElement) {
      successElement.style.display = 'none';
    }
  }

  hideMessages() {
    this.hideError();
    this.hideSuccess();
  }

  getRedirectUrl() {
    // Verificar se há URL de redirecionamento salva
    const savedUrl = sessionStorage.getItem('redirectUrl');
    if (savedUrl) {
      sessionStorage.removeItem('redirectUrl');
      return savedUrl;
    }

    // Sempre redirecionar para home após login
    return '#home';
  }

  logout() {
    // Remover dados de autenticação
    localStorage.removeItem('nutriScanToken');
    localStorage.removeItem('nutriScanUser');
    localStorage.removeItem('nutriScanRemember');

    // Redirecionar para login
    window.location.hash = 'login';
  }

  // Verificar se usuário está autenticado
  isAuthenticated() {
    const token = localStorage.getItem('nutriScanToken');
    const user = localStorage.getItem('nutriScanUser');
    return !!(token && user);
  }

  // Obter usuário atual
  getCurrentUser() {
    const userStr = localStorage.getItem('nutriScanUser');
    return userStr ? JSON.parse(userStr) : null;
  }

  // Verificar se usuário é premium
  isPremium() {
    const user = this.getCurrentUser();
    return user?.subscription?.plan === 'premium' && user?.subscription?.status === 'active';
  }
}

// Funções globais para acesso inline
function handleLogin(event) {
  loginSystem.handleLogin(event);
}

function handleGoogleLogin() {
  loginSystem.handleGoogleLogin();
}

function handleForgotPassword(event) {
  event.preventDefault();
  // Implementar recuperação de senha
  alert('Funcionalidade de recuperação de senha será implementada em breve.');
}

function handleSignup(event) {
  event.preventDefault();
  // Redirecionar para página de cadastro ou mostrar modal
  window.location.hash = 'signup';
}

// Inicializar sistema
let loginSystem;
document.addEventListener('DOMContentLoaded', () => {
  loginSystem = new LoginSystem();
});

// Disponibilizar globalmente
window.loginSystem = loginSystem;
// Sistema de Cadastro - Nutri-Scan
// Gerencia cadastro de novos usuários

class SignupSystem {
  constructor() {
    // Verificar se NutriScanAPI está disponível
    if (typeof NutriScanAPI !== 'undefined') {
      this.api = new NutriScanAPI();
    } else {
      console.warn('NutriScanAPI não encontrada, usando modo simulado');
      this.api = null;
    }
    this.init();
  }

  init() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Formulário de cadastro
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => this.handleSignup(e));
    }

    // Validação em tempo real
    this.setupRealTimeValidation();
  }

  setupRealTimeValidation() {
    // Validação de nome
    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');
    
    if (firstName) {
      firstName.addEventListener('blur', () => this.validateName(firstName, 'firstNameError'));
    }
    
    if (lastName) {
      lastName.addEventListener('blur', () => this.validateName(lastName, 'lastNameError'));
    }

    // Validação de email
    const email = document.getElementById('email');
    if (email) {
      email.addEventListener('blur', () => this.validateEmail(email, 'emailError'));
    }

    // Validação de senha
    const password = document.getElementById('password');
    if (password) {
      password.addEventListener('input', () => this.validatePassword(password, 'passwordError'));
    }

    // Validação de confirmação de senha
    const confirmPassword = document.getElementById('confirmPassword');
    if (confirmPassword) {
      confirmPassword.addEventListener('input', () => this.validatePasswordMatch(confirmPassword, 'confirmPasswordError'));
    }
  }

  // Limpar TODOS os dados do usuário (para logout ou troca de usuário)
  clearAllUserData() {
    console.log('🗑️ Limpando todos os dados do usuário anterior...');
    
    // Dados de autenticação
    localStorage.removeItem('nutriScanToken');
    localStorage.removeItem('nutriScanUser');
    localStorage.removeItem('nutriScanRemember');
    localStorage.removeItem('lastActivity');
    
    // Dados de scans e histórico
    localStorage.removeItem('nutriScanScans');
    localStorage.removeItem('allergyAnalysisHistory');
    localStorage.removeItem('pendingScans');
    
    // Dados de plano
    localStorage.removeItem('nutriScanPlan');
    
    // Dados do dashboard
    localStorage.removeItem('dashboardStats');
    localStorage.removeItem('dashboardScans');
    
    // Dados sincronizados
    localStorage.removeItem('syncedUser');
    
    // Limpar qualquer outro dado específico do usuário
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Remover qualquer chave que pareça ser específica do usuário
      if (key && (
        key.includes('scan') || 
        key.includes('allergy') || 
        key.includes('product') || 
        key.includes('analysis') ||
        key.includes('history')
      )) {
        keysToRemove.push(key);
      }
    }
    
    // Remover as chaves identificadas
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`  ✓ Removido: ${key}`);
    });
    
    console.log('✅ Todos os dados do usuário foram limpos!');
  }

  async handleSignup(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const userData = {
      firstName: formData.get('firstName').trim(),
      lastName: formData.get('lastName').trim(),
      email: formData.get('email').trim().toLowerCase(),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
      terms: formData.get('terms'),
      newsletter: formData.get('newsletter') === 'on'
    };

    // Validação completa
    if (!this.validateSignupForm(userData)) {
      return;
    }

    // Mostrar loading
    this.setLoadingState(true);
    this.hideMessages();

    try {
      // ✅ LIMPAR DADOS DO USUÁRIO ANTERIOR ANTES DO NOVO CADASTRO
      this.clearAllUserData();
      
      // Tentar verificar email e fazer cadastro, mas usar modo simulado se falhar
      let result;
      try {
        // Verificar se email já existe
        const emailCheck = await this.api.post('/auth/check-email', { email: userData.email });
        
        if (emailCheck.exists) {
          throw new Error('Este email já está cadastrado. Faça login ou use outro email.');
        }

        // Fazer cadastro
        result = await this.api.post('/auth/register', {
          name: `${userData.firstName} ${userData.lastName}`,
          email: userData.email,
          password: userData.password,
          preferences: {
            allergies: [],
            dietaryRestrictions: [],
            notifications: userData.newsletter,
            language: 'pt-BR'
          },
          subscription: {
            plan: 'free',
            status: 'active',
            startDate: new Date(),
            scansUsed: 0,
            scansLimit: 10
          }
        });
      } catch (apiError) {
        // Se falhar a conexão com o servidor, usar modo simulado
        console.log('Servidor não disponível, usando modo simulado para cadastro');
        
        // Verificar usuários já cadastrados no localStorage
        const registeredUsers = JSON.parse(localStorage.getItem('nutriScanRegisteredUsers') || '[]');
        
        // Verificar se email já existe
        if (registeredUsers.find(u => u.email === userData.email) || userData.email === 'demo@nutriscan.com') {
          throw new Error('Este email já está cadastrado. Faça login ou use outro email.');
        }
        
        // Criar novo usuário
        const newUser = {
          id: 'user_' + Date.now(),
          name: `${userData.firstName} ${userData.lastName}`,
          email: userData.email,
          password: userData.password, // Em produção, usar hash
          subscription: {
            plan: 'free',
            status: 'active',
            startDate: new Date(),
            scansUsed: 0,
            scansLimit: 10
          },
          preferences: {
            allergies: [],
            dietaryRestrictions: [],
            notifications: userData.newsletter,
            language: 'pt-BR'
          },
          createdAt: new Date()
        };
        
        // Salvar usuário no localStorage
        registeredUsers.push(newUser);
        localStorage.setItem('nutriScanRegisteredUsers', JSON.stringify(registeredUsers));
        
        // Criar resultado para login automático
        result = {
          success: true,
          token: 'simulated_token_' + Date.now(),
          user: {
            _id: newUser.id,
            userId: newUser.id,
            name: newUser.name,
            email: newUser.email,
            subscription: newUser.subscription,
            preferences: newUser.preferences
          }
        };
      }

      if (result.success) {
        // Salvar token e usuário
        localStorage.setItem('nutriScanToken', result.token);
        localStorage.setItem('nutriScanUser', JSON.stringify(result.user));
        localStorage.setItem('lastActivity', Date.now().toString());

        // Atualizar userSync/authMonitor se disponíveis
        try {
          if (window.userSync && typeof window.userSync.updateUser === 'function') window.userSync.updateUser(result.user);
          if (window.authMonitor && typeof window.authMonitor.checkAuthStatus === 'function') window.authMonitor.checkAuthStatus();
        } catch (e) {
          console.warn('userSync/authMonitor não disponíveis após cadastro:', e);
        }

        // Mostrar sucesso
        this.showSuccess('Conta criada com sucesso! Redirecionando...');

        // Redirecionar para home
        setTimeout(() => {
          window.location.hash = 'home';
        }, 2000);
      } else {
        throw new Error(result.message || 'Erro no cadastro');
      }
    } catch (error) {
      console.error('Erro no cadastro:', error);
      this.showError(error.message || 'Erro ao criar conta. Tente novamente.');
    } finally {
      this.setLoadingState(false);
    }
  }

  async handleGoogleSignup() {
    this.setLoadingState(true);
    this.hideMessages();

    try {
      // ✅ LIMPAR DADOS DO USUÁRIO ANTERIOR ANTES DO NOVO CADASTRO COM GOOGLE
      this.clearAllUserData();
      
      // Simular cadastro com Google
      const googleUser = await this.simulateGoogleSignup();
      
      // Tentar enviar para backend, mas usar modo simulado se falhar
      let result;
      try {
        result = await this.api.post('/auth/google-login', {
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          googleId: googleUser.id
        });
      } catch (apiError) {
        // Se falhar a conexão com o servidor, usar modo simulado
        console.log('Servidor não disponível, usando modo simulado para cadastro Google');
        result = {
          success: true,
          token: 'simulated_token_' + Date.now(),
          user: {
            _id: 'user_' + Date.now(),
            userId: 'user_' + Date.now(),
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture,
            subscription: {
              plan: 'free',
              status: 'active',
              startDate: new Date(),
              scansUsed: 0,
              scansLimit: 10
            },
            preferences: {
              allergies: [],
              dietaryRestrictions: [],
              notifications: true,
              language: 'pt-BR'
            }
          }
        };
      }

      if (result.success) {
        // Salvar dados
        localStorage.setItem('nutriScanToken', result.token);
        localStorage.setItem('nutriScanUser', JSON.stringify(result.user));

        // Atualizar userSync/authMonitor se disponíveis
        try {
          if (window.userSync && typeof window.userSync.updateUser === 'function') window.userSync.updateUser(result.user);
          if (window.authMonitor && typeof window.authMonitor.checkAuthStatus === 'function') window.authMonitor.checkAuthStatus();
        } catch (e) {
          console.warn('userSync/authMonitor não disponíveis após cadastro Google:', e);
        }

        this.showSuccess('Conta criada com Google! Redirecionando...');

        setTimeout(() => {
          window.location.hash = 'home';
        }, 2000);
      } else {
        throw new Error(result.message || 'Erro no cadastro Google');
      }
    } catch (error) {
      console.error('Erro no cadastro Google:', error);
      this.showError(error.message || 'Erro ao criar conta com Google.');
    } finally {
      this.setLoadingState(false);
    }
  }

  async simulateGoogleSignup() {
    // Simular resposta do Google Sign-In
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          email: 'novo.usuario@gmail.com',
          name: 'Novo Usuário',
          picture: 'https://lh3.googleusercontent.com/a/default-user',
          id: 'google_' + Date.now()
        });
      }, 1000);
    });
  }

  validateSignupForm(userData) {
    let isValid = true;

    // Validar nome
    if (!userData.firstName || userData.firstName.length < 2) {
      this.showFieldError('firstNameError', 'Nome deve ter pelo menos 2 caracteres.');
      isValid = false;
    }

    if (!userData.lastName || userData.lastName.length < 2) {
      this.showFieldError('lastNameError', 'Sobrenome deve ter pelo menos 2 caracteres.');
      isValid = false;
    }

    // Validar email
    if (!this.isValidEmail(userData.email)) {
      this.showFieldError('emailError', 'Por favor, insira um email válido.');
      isValid = false;
    }

    // Validar senha
    if (!userData.password || userData.password.length < 6) {
      this.showFieldError('passwordError', 'A senha deve ter pelo menos 6 caracteres.');
      isValid = false;
    }

    // Validar confirmação de senha
    if (userData.password !== userData.confirmPassword) {
      this.showFieldError('confirmPasswordError', 'As senhas não coincidem.');
      isValid = false;
    }

    // Validar termos
    if (!userData.terms) {
      this.showError('Você deve aceitar os Termos de Uso e Política de Privacidade.');
      isValid = false;
    }

    return isValid;
  }

  validateName(input, errorId) {
    const name = input.value.trim();
    const errorElement = document.getElementById(errorId);
    
    if (name.length > 0 && name.length < 2) {
      input.classList.add('error');
      this.showFieldError(errorId, 'Nome deve ter pelo menos 2 caracteres.');
      return false;
    } else {
      input.classList.remove('error');
      this.hideFieldError(errorId);
      return true;
    }
  }

  validateEmail(input, errorId) {
    const email = input.value.trim();
    const errorElement = document.getElementById(errorId);
    
    if (email.length > 0 && !this.isValidEmail(email)) {
      input.classList.add('error');
      this.showFieldError(errorId, 'Por favor, insira um email válido.');
      return false;
    } else {
      input.classList.remove('error');
      this.hideFieldError(errorId);
      return true;
    }
  }

  validatePassword(input, errorId) {
    const password = input.value;
    const errorElement = document.getElementById(errorId);
    
    if (password.length > 0 && password.length < 6) {
      input.classList.add('error');
      this.showFieldError(errorId, 'A senha deve ter pelo menos 6 caracteres.');
      return false;
    } else {
      input.classList.remove('error');
      this.hideFieldError(errorId);
      return true;
    }
  }

  validatePasswordMatch(input, errorId) {
    const password = document.getElementById('password').value;
    const confirmPassword = input.value;
    const errorElement = document.getElementById(errorId);
    
    if (confirmPassword.length > 0 && password !== confirmPassword) {
      input.classList.add('error');
      this.showFieldError(errorId, 'As senhas não coincidem.');
      return false;
    } else {
      input.classList.remove('error');
      this.hideFieldError(errorId);
      return true;
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  showFieldError(errorId, message) {
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    } else {
      console.warn(`Elemento de erro #${errorId} não encontrado`);
    }
  }

  hideFieldError(fieldId) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
      errorElement.style.display = 'none';
    } else {
      console.warn(`Elemento de erro #${fieldId} não encontrado`);
    }
  }

  setLoadingState(loading) {
    const signupBtn = document.getElementById('signupBtn');
    const googleBtn = document.querySelector('.google-signup-btn');

    if (loading) {
      if (signupBtn) {
        signupBtn.disabled = true;
        signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando conta...';
      }
      if (googleBtn) {
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
      }
    } else {
      if (signupBtn) {
        signupBtn.disabled = false;
        signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Criar Conta Gratuita';
      }
      if (googleBtn) {
        googleBtn.disabled = false;
        googleBtn.innerHTML = '<img src="https://developers.google.com/identity/images/g-logo.png" alt="Google"><span>Criar conta com Google</span>';
      }
    }
  }

  showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
    this.hideSuccess();
  }

  showSuccess(message) {
    const successElement = document.getElementById('successMessage');
    if (successElement) {
      successElement.textContent = message;
      successElement.style.display = 'block';
    }
    this.hideError();
  }

  hideError() {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
      errorElement.style.display = 'none';
    }
  }

  hideSuccess() {
    const successElement = document.getElementById('successMessage');
    if (successElement) {
      successElement.style.display = 'none';
    }
  }

  hideMessages() {
    this.hideError();
    this.hideSuccess();
  }
}

// Funções globais para acesso inline
function handleSignup(event) {
  signupSystem.handleSignup(event);
}

function handleGoogleSignup() {
  signupSystem.handleGoogleSignup();
}

// Inicializar sistema
let signupSystem;
document.addEventListener('DOMContentLoaded', () => {
  signupSystem = new SignupSystem();
});

// Disponibilizar globalmente
window.signupSystem = signupSystem;
// Gerenciador de Usuários - Nutri-Scan
// Ferramenta para visualizar e gerenciar usuários cadastrados

class UserManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupUI();
    this.displayUsers();
  }

  setupUI() {
    // Criar botão de gerenciamento se não existir
    if (!document.getElementById('userManagerBtn')) {
      const managerBtn = document.createElement('button');
      managerBtn.id = 'userManagerBtn';
      managerBtn.innerHTML = '<i class="fas fa-users"></i> Gerenciar Usuários';
      managerBtn.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #2ecc71;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 5px;
        cursor: pointer;
        z-index: 9999;
        font-size: 12px;
      `;
      managerBtn.onclick = () => this.showUserManager();
      document.body.appendChild(managerBtn);
    }
  }

  showUserManager() {
    // Remover modal existente
    const existingModal = document.getElementById('userManagerModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Criar modal
    const modal = document.createElement('div');
    modal.id = 'userManagerModal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 10px;
      max-width: 800px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    `;

    content.innerHTML = `
      <h2>Gerenciador de Usuários</h2>
      <button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: 10px; right: 10px; background: red; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">×</button>
      
      <div style="margin-bottom: 20px;">
        <button onclick="userManager.clearAllUsers()" style="background: #e74c3c; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; margin-right: 10px;">
          <i class="fas fa-trash"></i> Limpar Todos
        </button>
        <button onclick="userManager.createTestUser()" style="background: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer;">
          <i class="fas fa-user-plus"></i> Criar Usuário Teste
        </button>
      </div>
      
      <div id="usersList"></div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    this.displayUsers();
  }

  displayUsers() {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    const registeredUsers = JSON.parse(localStorage.getItem('nutriScanRegisteredUsers') || '[]');
    const currentUser = JSON.parse(localStorage.getItem('nutriScanUser') || 'null');

    if (registeredUsers.length === 0) {
      usersList.innerHTML = '<p>Nenhum usuário cadastrado.</p>';
      return;
    }

    let html = '<h3>Usuários Cadastrados:</h3><table style="width: 100%; border-collapse: collapse;">';
    html += '<tr style="background: #f0f0f0;"><th style="padding: 10px; border: 1px solid #ddd;">Nome</th><th style="padding: 10px; border: 1px solid #ddd;">Email</th><th style="padding: 10px; border: 1px solid #ddd;">Senha</th><th style="padding: 10px; border: 1px solid #ddd;">Status</th><th style="padding: 10px; border: 1px solid #ddd;">Ações</th></tr>';

    registeredUsers.forEach((user, index) => {
      const isCurrent = currentUser && currentUser.email === user.email;
      html += `<tr>
        <td style="padding: 10px; border: 1px solid #ddd;">${user.name} ${isCurrent ? '(👤)' : ''}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${user.email}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${user.password}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${user.subscription?.plan || 'free'}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">
          <button onclick="userManager.loginAsUser('${user.email}', '${user.password}')" style="background: #2ecc71; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">Login</button>
          <button onclick="userManager.deleteUser(${index})" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">Excluir</button>
        </td>
      </tr>`;
    });

    html += '</table>';
    
    // Adicionar usuário demo
    html += '<h3 style="margin-top: 20px;">Usuário Demo:</h3>';
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += '<tr style="background: #f0f0f0;"><th style="padding: 10px; border: 1px solid #ddd;">Nome</th><th style="padding: 10px; border: 1px solid #ddd;">Email</th><th style="padding: 10px; border: 1px solid #ddd;">Senha</th><th style="padding: 10px; border: 1px solid #ddd;">Ações</th></tr>';
    html += `<tr>
      <td style="padding: 10px; border: 1px solid #ddd;">Usuário Demo</td>
      <td style="padding: 10px; border: 1px solid #ddd;">demo@nutriscan.com</td>
      <td style="padding: 10px; border: 1px solid #ddd;">demo123</td>
      <td style="padding: 10px; border: 1px solid #ddd;">
        <button onclick="userManager.loginAsUser('demo@nutriscan.com', 'demo123')" style="background: #2ecc71; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">Login</button>
      </td>
    </tr>`;
    html += '</table>';

    usersList.innerHTML = html;
  }

  createTestUser() {
    const testUser = {
      id: 'user_' + Date.now(),
      name: 'Usuário Teste',
      email: 'teste@nutriscan.com',
      password: 'teste123',
      subscription: {
        plan: 'free',
        status: 'active',
        startDate: new Date(),
        scansUsed: 0,
        scansLimit: 10
      },
      preferences: {
        allergies: [],
        dietaryRestrictions: [],
        notifications: true,
        language: 'pt-BR'
      },
      createdAt: new Date()
    };

    const registeredUsers = JSON.parse(localStorage.getItem('nutriScanRegisteredUsers') || '[]');
    registeredUsers.push(testUser);
    localStorage.setItem('nutriScanRegisteredUsers', JSON.stringify(registeredUsers));

    alert('Usuário teste criado!\nEmail: teste@nutriscan.com\nSenha: teste123');
    this.displayUsers();
  }

  clearAllUsers() {
    if (confirm('Tem certeza que deseja excluir TODOS os usuários cadastrados?')) {
      localStorage.removeItem('nutriScanRegisteredUsers');
      localStorage.removeItem('nutriScanToken');
      localStorage.removeItem('nutriScanUser');
      alert('Todos os usuários foram excluídos.');
      this.displayUsers();
    }
  }

  deleteUser(index) {
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
      const registeredUsers = JSON.parse(localStorage.getItem('nutriScanRegisteredUsers') || '[]');
      registeredUsers.splice(index, 1);
      localStorage.setItem('nutriScanRegisteredUsers', JSON.stringify(registeredUsers));
      
      // Se era o usuário atual, fazer logout
      const currentUser = JSON.parse(localStorage.getItem('nutriScanUser') || 'null');
      if (currentUser && registeredUsers.findIndex(u => u.email === currentUser.email) === -1) {
        localStorage.removeItem('nutriScanToken');
        localStorage.removeItem('nutriScanUser');
      }
      
      this.displayUsers();
    }
  }

  loginAsUser(email, password) {
    // Simular login
    const registeredUsers = JSON.parse(localStorage.getItem('nutriScanRegisteredUsers') || '[]');
    const foundUser = registeredUsers.find(u => u.email === email);
    
    if (foundUser) {
      const result = {
        success: true,
        token: 'simulated_token_' + Date.now(),
        user: {
          _id: foundUser.id,
          userId: foundUser.id,
          email: foundUser.email,
          name: foundUser.name,
          subscription: foundUser.subscription,
          preferences: foundUser.preferences
        }
      };

      localStorage.setItem('nutriScanToken', result.token);
      localStorage.setItem('nutriScanUser', JSON.stringify(result.user));
        localStorage.setItem('lastActivity', Date.now().toString());

        // Notificar userSync e authMonitor
        try {
          if (window.userSync && typeof window.userSync.updateUser === 'function') window.userSync.updateUser(result.user);
          if (window.authMonitor && typeof window.authMonitor.checkAuthStatus === 'function') window.authMonitor.checkAuthStatus();
        } catch (e) {
          console.warn('Falha ao notificar userSync/authMonitor:', e);
        }
      
      alert(`Login realizado como ${foundUser.name}!`);
      window.location.hash = 'dashboard';
    } else {
      // Login como usuário demo
      const result = {
        success: true,
        token: 'simulated_token_' + Date.now(),
        user: {
          _id: 'demo_user',
          userId: 'demo_user',
          email: email,
          name: 'Usuário Demo',
          subscription: {
            plan: 'free',
            status: 'active',
            startDate: new Date(),
            scansUsed: 0,
            scansLimit: 10
          },
          preferences: {
            allergies: [],
            dietaryRestrictions: [],
            notifications: true,
            language: 'pt-BR'
          }
        }
      };

      localStorage.setItem('nutriScanToken', result.token);
      localStorage.setItem('nutriScanUser', JSON.stringify(result.user));
      
      alert('Login realizado como Usuário Demo!');
      window.location.hash = 'dashboard';
    }
  }
}

// Inicializar gerenciador
let userManager;
document.addEventListener('DOMContentLoaded', () => {
  userManager = new UserManager();
  window.userManager = userManager;
});

// Garantir que o userManager esteja disponível globalmente
if (typeof window !== 'undefined') {
  window.userManager = window.userManager || null;
}
// Sistema de Sincronização de Dados do Usuário em Tempo Real
class UserSyncManager {
  constructor() {
    this.currentUser = null;
    this.syncInterval = null;
    this.eventListeners = new Map();
    this.isOnline = navigator.onLine;
    this.lastSyncTime = null;
    
    this.init();
  }

  init() {
    // Carregar dados iniciais do usuário
    this.loadUserData();
    
    // Configurar listeners de eventos
    this.setupEventListeners();
    
    // Iniciar sincronização automática
    this.startAutoSync();
    
    // Configurar storage events para sincronização entre abas
    this.setupStorageEvents();
    
    console.log('UserSyncManager inicializado');
  }

  // Carregar dados do usuário do localStorage
  loadUserData() {
    try {
      const userData = localStorage.getItem('nutriScanUser');
      const token = localStorage.getItem('nutriScanToken');
      
      if (userData && token) {
        this.currentUser = JSON.parse(userData);
        this.updateAllUIElements();
        console.log('Dados do usuário carregados:', this.currentUser.name);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
    }
  }

  // Atualizar todos os elementos UI com dados do usuário
  updateAllUIElements() {
    if (!this.currentUser) return;

    // Elementos comuns em todas as páginas
    const userElements = {
      // Nome do usuário
      'userName': this.currentUser.name || 'Usuário',
      
      // Email do usuário
      'userEmail': this.currentUser.email || 'usuario@exemplo.com',
      
      // Avatar (iniciais)
      'userAvatar': this.getInitials(this.currentUser.name),
      
      // Badge de plano
      'userBadge': this.currentUser.plan || 'Free',
      
      // Profile name
      'profileName': this.currentUser.name || 'Usuário',
      
      'profileEmail': this.currentUser.email || 'usuario@exemplo.com',
      
      'profileBadge': this.currentUser.plan || 'Free'
    };

    // Atualizar cada elemento
    Object.entries(userElements).forEach(([elementId, value]) => {
      this.updateElement(elementId, value);
    });

    // Atualizar avatar com background image se existir
    if (this.currentUser.profileImage) {
      this.updateAvatarImages(this.currentUser.profileImage);
    }

    // Disparar evento de atualização
    this.dispatchSyncEvent('userUpdated', this.currentUser);
  }

  // Atualizar elemento específico
  updateElement(elementId, value) {
    const elements = document.querySelectorAll(`#${elementId}`);
    elements.forEach(element => {
      if (element) {
        // Se for avatar, usar texto (iniciais)
        if (elementId.includes('Avatar') && !element.style.backgroundImage) {
          element.textContent = value;
        } else {
          element.textContent = value;
        }
      }
    });
  }

  // Atualizar imagens de avatar
  updateAvatarImages(imageData) {
    const avatarElements = document.querySelectorAll('.user-avatar, #userAvatar, #profileAvatar');
    avatarElements.forEach(element => {
      if (element) {
        element.style.backgroundImage = `url(${imageData})`;
        element.style.backgroundSize = 'cover';
        element.style.backgroundPosition = 'center';
        element.textContent = '';
      }
    });
  }

  // Obter iniciais do nome
  getInitials(name) {
    if (!name) return 'U';
    return name.split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // Configurar event listeners
  setupEventListeners() {
    // Eventos de storage (sincronização entre abas)
    window.addEventListener('storage', (e) => {
      if (e.key === 'nutriScanUser') {
        this.handleStorageUpdate(e);
      }
    });

    // Eventos de online/offline
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncWithServer();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Eventos de visibilidade da página
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.currentUser) {
        this.syncWithServer();
      }
    });
  }

  // Configurar storage events para sincronização
  setupStorageEvents() {
    // Monitorar mudanças no localStorage
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = (key, value) => {
      originalSetItem.call(localStorage, key, value);
      
      if (key === 'nutriScanUser') {
        this.handleUserUpdate(JSON.parse(value));
      }
    };
  }

  // Lidar com atualização de usuário
  handleUserUpdate(userData) {
    const oldUser = this.currentUser;
    this.currentUser = userData;
    
    // Atualizar UI apenas se os dados mudaram
    if (!oldUser || JSON.stringify(oldUser) !== JSON.stringify(userData)) {
      this.updateAllUIElements();
      
      // Disparar evento de sincronização
      this.dispatchSyncEvent('userSynced', userData);
    }
  }

  // Lidar com atualização do storage
  handleStorageUpdate(event) {
    if (event.newValue) {
      try {
        const userData = JSON.parse(event.newValue);
        this.handleUserUpdate(userData);
      } catch (error) {
        console.error('Erro ao processar atualização do storage:', error);
      }
    }
  }

  // Iniciar sincronização automática
  startAutoSync() {
    // Sincronizar a cada 30 segundos
    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.currentUser) {
        this.syncWithServer();
      }
    }, 30000);
  }

  // Parar sincronização automática
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Sincronizar com servidor
  async syncWithServer() {
    if (!this.currentUser || !this.isOnline) return;

    try {
      // Tentar sincronizar com API
      const response = await fetch('/api/user/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Atualizar dados locais se forem diferentes
        if (JSON.stringify(data.user) !== JSON.stringify(this.currentUser)) {
          localStorage.setItem('nutriScanUser', JSON.stringify(data.user));
          this.handleUserUpdate(data.user);
        }
        
        this.lastSyncTime = new Date();
        console.log('Sincronização com servidor concluída');
      }
    } catch (error) {
      console.log('Sincronização offline - usando dados locais');
    }
  }

  // Atualizar dados do usuário (chamado por outras páginas)
  updateUser(userData) {
    localStorage.setItem('nutriScanUser', JSON.stringify(userData));
    this.handleUserUpdate(userData);
  }

  // Atualizar foto de perfil
  updateProfileImage(imageData) {
    if (!this.currentUser) return;

    this.currentUser.profileImage = imageData;
    localStorage.setItem('nutriScanUser', JSON.stringify(this.currentUser));
    
    // Atualizar UI imediatamente
    this.updateAvatarImages(imageData);
    
    // Disparar evento
    this.dispatchSyncEvent('profileImageUpdated', imageData);
  }

  // Disparar evento de sincronização
  dispatchSyncEvent(eventType, data) {
    const event = new CustomEvent('userSync', {
      detail: {
        type: eventType,
        data: data,
        timestamp: new Date()
      }
    });
    
    document.dispatchEvent(event);
    
    // Notificar listeners registrados
    if (this.eventListeners.has(eventType)) {
      this.eventListeners.get(eventType).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Erro no callback de evento:', error);
        }
      });
    }
  }

  // Registrar listener de evento
  on(eventType, callback) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType).push(callback);
  }

  // Remover listener de evento
  off(eventType, callback) {
    if (this.eventListeners.has(eventType)) {
      const callbacks = this.eventListeners.get(eventType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Limpar recursos
  destroy() {
    this.stopAutoSync();
    this.eventListeners.clear();
    this.currentUser = null;
  }

  // Forçar sincronização manual
  forceSync() {
    this.loadUserData();
    this.syncWithServer();
  }

  // Obter status da sincronização
  getSyncStatus() {
    return {
      isOnline: this.isOnline,
      lastSync: this.lastSyncTime,
      currentUser: this.currentUser
    };
  }
}

// Criar instância global
window.userSync = new UserSyncManager();

// Expor funções globais para compatibilidade
window.updateUserData = (userData) => {
  window.userSync.updateUser(userData);
};

window.updateProfileImage = (imageData) => {
  window.userSync.updateProfileImage(imageData);
};

// Listener global para eventos de sincronização
document.addEventListener('userSync', (e) => {
  console.log('Evento de sincronização:', e.detail.type, e.detail.timestamp);
});

// Exportar para módulos (se usar)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UserSyncManager;
}
class ActionsPopupManager {
  constructor() {
    this.popup = null;
    this.overlay = null;
    this.isOpen = false;
    this.init();
  }

  init() {
    this.createPopup();
    this.setupEventListeners();
  }

  createPopup() {
    const overlay = document.createElement('div');
    overlay.id = 'actionsPopupOverlay';
    overlay.className = 'actions-popup-overlay';
    
    const popupContent = `
      <div class="actions-popup-content">
        <div class="actions-popup-header">
          <h3>
            <i class="fas fa-sliders-h"></i>
            Configurações Rápidas
          </h3>
          <button class="actions-popup-close" onclick="actionsPopup.closePopup()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="actions-popup-body">
          <div class="action-item" id="themeActionItem">
            <div class="action-info">
              <div class="action-icon">
                <i class="fas fa-moon"></i>
              </div>
              <div class="action-label">
                <h4>Modo Escuro</h4>
                <p id="themeStatus">Desativado</p>
              </div>
            </div>
            <div class="action-toggle">
              <button class="toggle-switch" id="themeToggleSwitch" onclick="actionsPopup.toggleTheme(event)"></button>
            </div>
          </div>

          <!-- Atalhos de Teclado -->
          <div class="action-item">
            <div class="action-info">
              <div class="action-icon">
                <i class="fas fa-keyboard"></i>
              </div>
              <div class="action-label">
                <h4>Atalhos de Teclado</h4>
                <p>Ver lista completa</p>
              </div>
            </div>
            <button class="action-button" onclick="actionsPopup.showKeyboardShortcuts()">
              <i class="fas fa-arrow-right"></i>
            </button>
          </div>

          <!-- Notificações -->
          <div class="action-item">
            <div class="action-info">
              <div class="action-icon">
                <i class="fas fa-bell"></i>
              </div>
              <div class="action-label">
                <h4>Notificações</h4>
                <p id="notificationStatus">Ativadas</p>
              </div>
            </div>
            <div class="action-toggle">
              <button class="toggle-switch active" id="notificationToggleSwitch" onclick="actionsPopup.toggleNotifications(event)"></button>
            </div>
          </div>

          <!-- Modo Offline -->
          <div class="action-item">
            <div class="action-info">
              <div class="action-icon">
                <i class="fas fa-wifi"></i>
              </div>
              <div class="action-label">
                <h4>Disponibilidade Offline</h4>
                <p>Permite uso sem internet</p>
              </div>
            </div>
            <button class="action-button" onclick="actionsPopup.openOfflineSettings()">
              <i class="fas fa-cog"></i>
            </button>
          </div>
        </div>
        
        <div class="actions-popup-footer">
          <p><strong>Dica:</strong> Use <strong>"?"</strong> para abrir atalhos</p>
          <small>Ctrl+Shift+D para modo escuro</small>
        </div>
      </div>
    `;
    
    overlay.innerHTML = popupContent;
    document.body.appendChild(overlay);
    
    this.overlay = overlay;
    this.popup = overlay.querySelector('.actions-popup-content');
  }

  setupEventListeners() {
    // Fechar popup ao clicar no overlay
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.closePopup();
      }
    });

    // Fechar popup ao pressionar ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closePopup();
      }
    });

    // Atualizar status do tema ao carregar
    this.updateThemeStatus();

    // Ouvir mudanças de tema para manter o toggle sincronizado
    document.addEventListener('themechange', () => {
      this.updateThemeStatus();
    });
  }

  openPopup() {
    this.overlay.classList.add('active');
    this.isOpen = true;
    this.updateThemeStatus();
    document.body.style.overflow = 'hidden';
  }

  closePopup() {
    this.overlay.classList.remove('active');
    this.isOpen = false;
    document.body.style.overflow = 'auto';
  }

  togglePopup() {
    if (this.isOpen) {
      this.closePopup();
    } else {
      this.openPopup();
    }
  }

  updateThemeStatus() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || 
                   (window.darkModeManager && window.darkModeManager.isDarkMode) ||
                   localStorage.getItem('darkModePreference') === 'dark';
    const themeToggle = document.getElementById('themeToggleSwitch');
    const themeStatus = document.getElementById('themeStatus');
    
    if (themeToggle) {
      if (isDark) {
        themeToggle.classList.add('active');
        themeStatus.textContent = 'Ativado';
      } else {
        themeToggle.classList.remove('active');
        themeStatus.textContent = 'Desativado';
      }
    }
  }

  toggleTheme(event) {
    event.stopPropagation();
    
    if (window.darkModeManager) {
      window.darkModeManager.toggleTheme();
    }
    
    setTimeout(() => {
      this.updateThemeStatus();
    }, 100);
  }

  toggleNotifications(event) {
    event.stopPropagation();
    
    const toggle = event.target;
    const status = document.getElementById('notificationStatus');
    
    toggle.classList.toggle('active');
    status.textContent = toggle.classList.contains('active') ? 'Ativadas' : 'Desativadas';
    
    // Salvar preferência
    const isEnabled = toggle.classList.contains('active');
    localStorage.setItem('notificationsEnabled', isEnabled);
  }

  showKeyboardShortcuts() {
    this.closePopup();
    
    if (typeof showKeyboardShortcuts === 'function') {
      showKeyboardShortcuts();
    }
  }

  openOfflineSettings() {
    this.closePopup();
    
    // Avisar sobre offline
    alert('Modo offline: Esta funcionalidade estará disponível em breve.');
  }
}

// Inicializar quando DOM carregar
let actionsPopup;
function initActionsPopup() {
  if (!actionsPopup) actionsPopup = new ActionsPopupManager();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initActionsPopup);
} else {
  initActionsPopup();
}

// Função para abrir popup (pode ser chamada de qualquer lugar)
function openActionsPopup() {
  initActionsPopup();
  if (actionsPopup) {
    actionsPopup.openPopup();
  }
}

// Função para fechar popup
function closeActionsPopup() {
  if (actionsPopup) {
    actionsPopup.closePopup();
  }
}
// Sistema de Atalhos de Teclado Globais
// Safe-Bite Keyboard Shortcuts Manager

class KeyboardShortcutsManager {
  constructor() {
    this.shortcuts = new Map();
    this.isEnabled = true;
    this.helpModal = null;
    // this.init();
  }

  init() {
    console.log('⌨️ Iniciando sistema de atalhos de teclado');
    
    // Configurar atalhos padrão
    this.setupDefaultShortcuts();
    
    // Configurar listener de eventos
    this.setupEventListeners();
    
    // Adicionar botão de ajuda
    // this.addHelpButton();
  }

  // Configurar atalhos padrão
  setupDefaultShortcuts() {
    // Navegação
    this.addShortcut('h', 'home', 'Ir para página inicial', () => {
      window.location.hash = 'home';
    });
    
    this.addShortcut('d', 'theme-shortcut', 'Alternar tema', () => {
      if (window.darkModeManager) {
        darkModeManager.toggleTheme();
      }
    });
    
    this.addShortcut('s', 'scan', 'Iniciar novo scan', () => {
      if (typeof simulateUploadAndScan === 'function') {
        simulateUploadAndScan();
      } else {
        window.location.hash = 'como-funciona';
      }
    });
    
    // Ações
    this.addShortcut('n', 'new', 'Novo scan', () => {
      if (typeof simulateUploadAndScan === 'function') {
        simulateUploadAndScan();
      }
    });
    
    this.addShortcut('e', 'export', 'Exportar dados', () => {
      if (typeof exportScanData === 'function') {
        exportScanData();
      }
    });
    
    this.addShortcut('f', 'search', 'Focar busca', () => {
      const searchInput = document.getElementById('scanSearch');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    });
    
    // Interface
    this.addShortcut('t', 'theme', 'Alternar tema', () => {
      if (window.darkModeManager) {
        darkModeManager.toggleTheme();
      }
    });
    
    this.addShortcut('l', 'logout', 'Logout', () => {
      if (window.authMonitor) {
        authMonitor.logout('Logout via atalho de teclado');
      }
    });
    
    // Ajuda
    this.addShortcut('?', 'help', 'Mostrar ajuda', () => {
      this.showHelp();
    });
    
    // Modificadores
    this.addShortcut(['ctrl', 'shift', 'd'], 'theme', 'Alternar tema (Ctrl+Shift+D)', () => {
      if (window.darkModeManager) {
        darkModeManager.toggleTheme();
      }
    });
    
    this.addShortcut(['ctrl', 'shift', 's'], 'save', 'Salvar dados', () => {
      if (typeof saveToLocalStorage === 'function') {
        saveToLocalStorage();
      }
    });
    
    this.addShortcut(['ctrl', 'shift', 'r'], 'refresh', 'Recarregar dados', () => {
      if (window.authMonitor) {
        authMonitor.forceCheck();
      }
    });
    
    this.addShortcut(['ctrl', 'shift', 'e'], 'export', 'Exportar dados', () => {
      if (typeof exportScanData === 'function') {
        exportScanData();
      }
    });
    
    // Navegação no dashboard
    this.addShortcut('left', 'previous', 'Página anterior', () => {
      if (typeof previousPage === 'function') {
        previousPage();
      }
    });
    
    this.addShortcut('right', 'next', 'Próxima página', () => {
      if (typeof nextPage === 'function') {
        nextPage();
      }
    });
    
    this.addShortcut('escape', 'close', 'Fechar modal', () => {
      this.closeAllModals();
    });
    
    console.log(`📋 ${this.shortcuts.size} atalhos configurados`);
  }

  // Adicionar atalho
  addShortcut(keys, id, description, action) {
    const shortcut = {
      keys: Array.isArray(keys) ? keys : [keys],
      id,
      description,
      action,
      enabled: true
    };
    
    this.shortcuts.set(id, shortcut);
  }

  // Configurar listener de eventos
  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (!this.isEnabled) return;
      
      // Ignorar atalhos em campos de input
      if (this.isInputElement(e.target)) {
        return;
      }
      
      // Verificar cada atalho
      this.shortcuts.forEach((shortcut, id) => {
        if (this.matchesShortcut(e, shortcut)) {
          e.preventDefault();
          e.stopPropagation();
          
          console.log(`⌨️ Atalho acionado: ${id}`);
          
          try {
            shortcut.action();
          } catch (error) {
            console.error(`Erro ao executar atalho ${id}:`, error);
          }
        }
      });
    });
    
    console.log('🎧 Listener de atalhos configurado');
  }

  // Verificar se atalho corresponde
  matchesShortcut(event, shortcut) {
    if (!shortcut.enabled) return false;
    
    const keys = [];
    if (event.ctrlKey) keys.push('ctrl');
    if (event.shiftKey) keys.push('shift');
    if (event.altKey) keys.push('alt');
    if (event.metaKey) keys.push('meta');
    
    // Adicionar tecla principal
    const mainKey = event.key.toLowerCase();
    if (mainKey !== 'control' && mainKey !== 'shift' && mainKey !== 'alt' && mainKey !== 'meta') {
      keys.push(mainKey);
    }
    
    // Verificar se combinação corresponde
    return this.arraysEqual(keys.sort(), shortcut.keys.sort());
  }

  // Comparar arrays
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // Verificar se elemento é input
  isInputElement(element) {
    const inputTypes = ['input', 'textarea', 'select'];
    const contentEditable = element.contentEditable === 'true';
    
    return inputTypes.includes(element.tagName.toLowerCase()) || contentEditable;
  }

  // Fechar todos os modais
  closeAllModals() {
    const modals = document.querySelectorAll('.modal, .notification, .advanced-notification');
    modals.forEach(modal => {
      if (modal.remove) {
        modal.remove();
      } else if (modal.style) {
        modal.style.display = 'none';
      }
    });
  }

   // Mostrar modal de ajuda
  showHelp() {
    if (this.helpModal) {
      this.helpModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'keyboard-help-modal';
    modal.innerHTML = `
      <div class="help-overlay" onclick="this.parentElement.remove()"></div>
      <div class="help-content">
        <div class="help-header">
          <h3>⌨️ Atalhos de Teclado</h3>
          <button class="help-close" onclick="this.closest('.keyboard-help-modal').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="help-body">
          <div class="help-sections">
            ${this.generateHelpSections()}
          </div>
          <div class="help-tips">
            <h4>💡 Dicas</h4>
            <ul>
              <li>Use <kbd>?</kbd> para abrir esta ajuda a qualquer momento</li>
              <li>Atalhos não funcionam em campos de texto</li>
              <li>Combine <kbd>Ctrl</kbd> ou <kbd>Cmd</kbd> com outras teclas para ações avançadas</li>
              <li>Pressione <kbd>Esc</kbd> para fechar modais</li>
            </ul>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.helpModal = modal;
    
    // Focar no modal
    setTimeout(() => {
      const closeBtn = modal.querySelector('.help-close');
      if (closeBtn) {
        closeBtn.focus();
      }
    }, 100);
  }

  // Gerar seções de ajuda
  generateHelpSections() {
    const sections = {
      '🧭 Navegação': [
        { keys: 'H', desc: 'Ir para página inicial' },
        { keys: 'D', desc: 'Alternar tema' },
        { keys: '← →', desc: 'Navegar entre páginas' }
      ],
      '📸 Scans': [
        { keys: 'S', desc: 'Iniciar novo scan' },
        { keys: 'N', desc: 'Novo scan' },
        { keys: 'F', desc: 'Focar busca' }
      ],
      '⚙️ Ações': [
        { keys: 'T', desc: 'Alternar tema' },
        { keys: 'E', desc: 'Exportar dados' },
        { keys: 'L', desc: 'Logout' }
      ],
      '🔧 Avançado': [
        { keys: 'Ctrl+Shift+D', desc: 'Alternar tema' },
        { keys: 'Ctrl+Shift+S', desc: 'Salvar dados' },
        { keys: 'Ctrl+Shift+R', desc: 'Recarregar dados' },
        { keys: 'Ctrl+Shift+E', desc: 'Exportar dados' }
      ],
      '🎮 Controle': [
        { keys: 'Esc', desc: 'Fechar modal' },
        { keys: '?', desc: 'Mostrar ajuda' }
      ]
    };
    
    let html = '';
    for (const [title, shortcuts] of Object.entries(sections)) {
      html += `
        <div class="help-section">
          <h4>${title}</h4>
          <div class="shortcuts-list">
            ${shortcuts.map(shortcut => `
              <div class="shortcut-item">
                <div class="shortcut-keys">
                  ${this.formatKeys(shortcut.keys)}
                </div>
                <div class="shortcut-desc">${shortcut.desc}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    return html;
  }

  // Formatar teclas para exibição
  formatKeys(keys) {
    if (typeof keys === 'string') {
      return `<kbd>${keys}</kbd>`;
    }
    
    return keys.map(key => {
      if (key.includes('+')) {
        return key.split('+').map(k => `<kbd>${k}</kbd>`).join(' + ');
      }
      return `<kbd>${key}</kbd>`;
    }).join(' + ');
  }

  // Habilitar/desabilitar atalhos
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`🔧 Atalhos ${enabled ? 'habilitados' : 'desabilitados'}`);
  }

  // Obter lista de atalhos
  getShortcuts() {
    const shortcuts = [];
    this.shortcuts.forEach((shortcut, id) => {
      shortcuts.push({
        id,
        keys: shortcut.keys,
        description: shortcut.description,
        enabled: shortcut.enabled
      });
    });
    return shortcuts;
  }

  // Destruir
  destroy() {
    this.shortcuts.clear();
    if (this.helpModal) {
      this.helpModal.remove();
    }
    console.log('🗑️ Sistema de atalhos desativado');
  }
}

// Criar instância global
let keyboardShortcuts;

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  keyboardShortcuts = new KeyboardShortcutsManager();
  
  // Tornar globalmente acessível
  window.keyboardShortcuts = keyboardShortcuts;
  
  console.log('✅ Sistema de atalhos de teclado carregado');
});

// Exportar para uso global
window.KeyboardShortcutsManager = KeyboardShortcutsManager;
// Popup de Upgrade para Premium
// Gerenciador de popup com botões Cancelar e Começar Grátis

class UpgradePopupManager {
  constructor() {
    this.popup = null;
    this.init();
  }

  init() {
    this.createPopup();
    this.setupEventListeners();
  }

  createPopup() {
    // Criar popup HTML
    const popupHTML = `
      <div id="upgradePopup" class="upgrade-popup-overlay" style="display: none;">
        <div class="upgrade-popup-content">
          <div class="popup-header">
            <div class="popup-icon">🚀</div>
            <h3>Upgrade para Premium</h3>
          </div>
          
          <div class="popup-body">
            <p>Você será redirecionado para a página de pagamento para completar sua assinatura Premium.</p>
            
            <div class="premium-benefits">
              <div class="benefit-item">
                <i class="fas fa-check-circle"></i>
                <span>Scans ilimitados</span>
              </div>
              <div class="benefit-item">
                <i class="fas fa-check-circle"></i>
                <span>Análise avançada de ingredientes</span>
              </div>
              <div class="benefit-item">
                <i class="fas fa-check-circle"></i>
                <span>Relatórios personalizados</span>
              </div>
              <div class="benefit-item">
                <i class="fas fa-check-circle"></i>
                <span>Suporte prioritário</span>
              </div>
            </div>
          </div>
          
          <div class="popup-actions" id="popupActions">
            <button class="btn-cancel" onclick="upgradePopup.closePopup()">
              <i class="fas fa-times"></i>
              Cancelar
            </button>
            <button class="btn-premium" onclick="upgradePopup.goToPayment()">
              <i class="fas fa-crown"></i>
              Ver Planos
            </button>
          </div>
        </div>
      </div>
    `;

    // Adicionar popup ao body
    document.body.insertAdjacentHTML('beforeend', popupHTML);
    this.popup = document.getElementById('upgradePopup');
  }

  setupEventListeners() {
    // Fechar popup ao clicar fora
    this.popup.addEventListener('click', (e) => {
      if (e.target === this.popup) {
        this.closePopup();
      }
    });

    // Fechar com ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.popup.style.display === 'flex') {
        this.closePopup();
      }
    });
  }

  showPopup() {
    this.popup.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevenir scroll
    
    // Verificar plano do usuário e ajustar botões
    this.adjustButtonsForUserPlan();
  }

  adjustButtonsForUserPlan() {
    const user = loginSystem?.getCurrentUser();
    const btnFreeTrial = document.getElementById('btnFreeTrial');
    const popupActions = document.getElementById('popupActions');
    
    if (!user) {
      // Usuário não logado - mostrar botão "Começar Grátis" com login Google
      if (btnFreeTrial) {
        btnFreeTrial.style.display = 'block';
        btnFreeTrial.innerHTML = '<i class="fas fa-google"></i> Entrar com Google';
        btnFreeTrial.onclick = () => this.startFreeTrialWithGoogle();
      }
    } else if (user.subscription?.plan === 'premium') {
      // Usuário premium - REMOVER completamente o botão "Começar Grátis"
      if (btnFreeTrial) {
        btnFreeTrial.remove(); // Remove completamente do DOM
      }
    } else {
      // Usuário free - mostrar botão "Começar Grátis"
      if (btnFreeTrial) {
        btnFreeTrial.style.display = 'block';
        btnFreeTrial.innerHTML = '<i class="fas fa-gift"></i> Começar Grátis';
        btnFreeTrial.onclick = () => this.startFreeTrial();
      }
    }
  }

  closePopup() {
    this.popup.style.display = 'none';
    document.body.style.overflow = ''; // Restaurar scroll
  }

  goToPayment() {
    this.closePopup();
    window.location.hash = 'payment';
  }

  startFreeTrial() {
    this.closePopup();
    // Verificar se usuário já está logado
    const token = localStorage.getItem('nutriScanToken');
    
    if (token) {
      // Usuário já logado, redirecionar para dashboard
      window.location.hash = 'dashboard';
    } else {
      // Usuário não logado, mostrar tela de login
      this.showLoginModal();
    }
  }

  startFreeTrialWithGoogle() {
    this.closePopup();
    // Fazer login direto com Google
    if (loginSystem) {
      loginSystem.handleGoogleLogin();
    } else {
      // Fallback - redirecionar para página de login
      window.location.hash = 'login';
    }
  }

  showLoginModal() {
    // Criar modal de login
    const loginModal = document.createElement('div');
    loginModal.className = 'login-modal-overlay';
    loginModal.innerHTML = `
      <div class="login-modal-content">
        <div class="login-header">
          <h3>Faça seu Login</h3>
          <button class="close-btn" onclick="this.closest('.login-modal-overlay').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="login-body">
          <div class="google-login-section">
            <h4>Entrar com Google</h4>
            <button class="google-login-btn" onclick="loginManager.signInWithGoogle()">
              <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google">
              <span>Continuar com Google</span>
            </button>
          </div>
          
          <div class="divider">
            <span>ou</span>
          </div>
          
          <div class="email-login-section">
            <h4>Entrar com Email</h4>
            <form id="emailLoginForm" onsubmit="loginManager.signInWithEmail(event)">
              <div class="form-group">
                <label for="loginEmail">Email</label>
                <input type="email" id="loginEmail" placeholder="seu@email.com" required>
              </div>
              <div class="form-group">
                <label for="loginPassword">Senha</label>
                <input type="password" id="loginPassword" placeholder="Sua senha" required>
              </div>
              <button type="submit" class="btn-primary">
                <i class="fas fa-sign-in-alt"></i>
                Entrar
              </button>
            </form>
          </div>
          
          <div class="login-footer">
            <p>Não tem uma conta? 
              <a href="#" onclick="loginManager.showSignup()">Cadastre-se</a>
            </p>
            <p>
              <a href="#" onclick="loginManager.forgotPassword()">Esqueceu a senha?</a>
            </p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(loginModal);
    
    // Adicionar estilos se não existirem
    if (!document.querySelector('#loginModalStyles')) {
      this.addLoginModalStyles();
    }
  }

  addLoginModalStyles() {
    const styles = `
      <style id="loginModalStyles">
        .login-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
        }
        
        .login-modal-content {
          background: white;
          border-radius: 15px;
          max-width: 450px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
        }
        
        .login-header {
          padding: 2rem 2rem 1rem;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .login-header h3 {
          margin: 0;
          color: var(--text-dark);
          font-size: 1.5rem;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 1.2rem;
          cursor: pointer;
          color: var(--text-light);
          padding: 0.5rem;
          border-radius: 50%;
          transition: all 0.3s ease;
        }
        
        .close-btn:hover {
          background: var(--light-gray);
          color: var(--text-dark);
        }
        
        .login-body {
          padding: 2rem;
        }
        
        .google-login-section {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .google-login-section h4 {
          margin-bottom: 1rem;
          color: var(--text-dark);
        }
        
        .google-login-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          background: white;
          border: 2px solid #ddd;
          border-radius: 8px;
          padding: 1rem;
          cursor: pointer;
          font-size: 1rem;
          transition: all 0.3s ease;
          width: 100%;
        }
        
        .google-login-btn:hover {
          background: #f8f9fa;
          border-color: #4285f4;
        }
        
        .google-login-btn img {
          width: 20px;
          height: 20px;
        }
        
        .divider {
          text-align: center;
          margin: 2rem 0;
          position: relative;
        }
        
        .divider::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: #ddd;
        }
        
        .divider span {
          background: white;
          padding: 0 1rem;
          color: var(--text-light);
        }
        
        .email-login-section h4 {
          margin-bottom: 1rem;
          color: var(--text-dark);
        }
        
        .login-footer {
          text-align: center;
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid #eee;
        }
        
        .login-footer p {
          margin: 0.5rem 0;
          color: var(--text-light);
          font-size: 0.9rem;
        }
        
        .login-footer a {
          color: var(--primary-green);
          text-decoration: none;
          font-weight: 500;
        }
        
        .login-footer a:hover {
          text-decoration: underline;
        }
        
        @media (max-width: 480px) {
          .login-modal-content {
            margin: 1rem;
            max-width: calc(100% - 2rem);
          }
          
          .login-header, .login-body {
            padding: 1.5rem;
          }
        }
      </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
  }
}

// Gerenciador de Login
class LoginManager {
  constructor() {
    this.initGoogleAuth();
  }

  initGoogleAuth() {
    // Carregar Google API
    if (!window.gapi) {
      this.loadGoogleScript();
    }
  }

  loadGoogleScript() {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/platform.js';
    script.onload = () => {
      this.initializeGoogleAuth();
    };
    document.head.appendChild(script);
  }

  initializeGoogleAuth() {
    // Configurar Google Auth (simulado para demonstração)
    console.log('Google Auth inicializado');
  }

  async signInWithGoogle() {
    try {
      // Simulação de login com Google
      // Em produção, usaria Google Sign-In API
      
      // Mostrar loading
      this.showLoading('Entrando com Google...');
      
      // Simular delay de autenticação
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Criar usuário simulado do Google
      const googleUser = {
        email: 'usuario@gmail.com',
        name: 'Usuário Google',
        picture: 'https://lh3.googleusercontent.com/a/default-user',
        id: 'google_user_id'
      };
      
      // Registrar ou fazer login
      await this.registerOrLoginGoogleUser(googleUser);
      
      // Fechar modal
      document.querySelector('.login-modal-overlay')?.remove();
      
      // Redirecionar
      window.location.hash = 'dashboard';
      
    } catch (error) {
      console.error('Erro no login Google:', error);
      this.showError('Erro ao fazer login com Google');
    }
  }

  async registerOrLoginGoogleUser(googleUser) {
    try {
      // Verificar se usuário já existe
      const response = await fetch('/api/auth/google-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          googleId: googleUser.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Salvar token e usuário
        localStorage.setItem('nutriScanToken', data.token);
        localStorage.setItem('nutriScanUser', JSON.stringify(data.user));
        localStorage.setItem('lastActivity', Date.now().toString());

          // Notificar userSync/authMonitor
          try {
            if (window.userSync && typeof window.userSync.updateUser === 'function') window.userSync.updateUser(data.user);
            if (window.authMonitor && typeof window.authMonitor.checkAuthStatus === 'function') window.authMonitor.checkAuthStatus();
          } catch (e) {
            console.warn('Falha ao notificar userSync/authMonitor após upgrade:', e);
          }
        
        this.showSuccess('Login realizado com sucesso!');
      } else {
        throw new Error(data.message || 'Erro no login');
      }
    } catch (error) {
      console.error('Erro ao registrar/login Google:', error);
      throw error;
    }
  }

  async signInWithEmail(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
      this.showLoading('Fazendo login...');
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      
      if (data.success) {
        localStorage.setItem('nutriScanToken', data.token);
        localStorage.setItem('nutriScanUser', JSON.stringify(data.user));
        
        document.querySelector('.login-modal-overlay')?.remove();
        window.location.hash = 'home';
      } else {
        throw new Error(data.message || 'Erro no login');
      }
    } catch (error) {
      console.error('Erro no login:', error);
      this.showError(error.message || 'Erro ao fazer login');
    }
  }

  showSignup() {
    // Implementar tela de cadastro
    alert('Tela de cadastro será implementada');
  }

  forgotPassword() {
    // Implementar recuperação de senha
    alert('Recuperação de senha será implementada');
  }

  showLoading(message) {
    // Implementar loading
    console.log('Loading:', message);
  }

  showSuccess(message) {
    // Implementar sucesso
    console.log('Success:', message);
  }

  showError(message) {
    // Implementar erro
    console.error('Error:', message);
  }
}

// Inicializar gerenciadores
let upgradePopup;
let loginManager;

document.addEventListener('DOMContentLoaded', () => {
  upgradePopup = new UpgradePopupManager();
  loginManager = new LoginManager();
});

// Funções globais para acesso inline
window.upgradePopup = upgradePopup;
window.loginManager = loginManager;

// Função para mostrar popup de upgrade
function showUpgradePopup() {
  if (upgradePopup) {
    upgradePopup.showPopup();
  }
}
// Sistema de Contato Safe-Bite
class ContactSystem {
  constructor() {
    // Verificar se NutriScanAPI está disponível
    if (typeof NutriScanAPI !== 'undefined') {
      this.api = new NutriScanAPI();
    } else {
      console.warn('NutriScanAPI não encontrada, usando modo simulado');
      this.api = null;
    }
    this.form = null;
    this.submitButton = null;
    this.storageKey = 'nutriscan_contact_form_data';
    this.autoSaveInterval = null;
    this.init();
  }

  init() {
    this.form = document.getElementById('contactForm');
    this.submitButton = document.querySelector('.btn-submit');
    
    if (this.form) {
      this.setupEventListeners();
      this.loadSavedData();
      this.startAutoSave();
    }
  }

  setupEventListeners() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Validação em tempo real
    const inputs = this.form.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      input.addEventListener('blur', () => this.validateField(input));
      input.addEventListener('input', () => {
        this.clearFieldError(input);
        this.saveFormData(); // Auto-salvar ao digitar
      });
    });

    // Salvar ao sair da página
    window.addEventListener('beforeunload', () => {
      this.saveFormData();
    });

    // Limpar dados após envio bem-sucedido
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        this.loadSavedData();
      }
    });
  }

  async handleSubmit() {
    const formData = this.getFormData();
    
    if (!this.validateForm(formData)) {
      return;
    }

    this.setLoadingState(true);
    this.hideMessages();

    try {
      const response = await this.api.post('/contact', formData);
      
      if (response.success) {
        this.showSuccess(response.message);
        this.resetForm();
        
        // Mostrar informações de debug em desenvolvimento
        if (response.debug && window.location.hostname === 'localhost') {
          console.log('Debug info:', response.debug);
        }
      } else {
        this.showError(response.message || 'Erro ao enviar mensagem.');
      }
    } catch (error) {
      console.error('Erro no envio:', error);
      this.showError('Erro de conexão. Tente novamente mais tarde.');
    } finally {
      this.setLoadingState(false);
    }
  }

  getFormData() {
    return {
      nome: document.getElementById('nome').value.trim(),
      email: document.getElementById('email').value.trim(),
      mensagem: document.getElementById('mensagem').value.trim()
    };
  }

  validateForm(data) {
    let isValid = true;

    // Validar nome
    if (!data.nome) {
      this.showFieldError('nome', 'Nome é obrigatório.');
      isValid = false;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
      this.showFieldError('email', 'Email inválido.');
      isValid = false;
    }

    // Validar mensagem
    if (!data.mensagem || data.mensagem.length < 3) {
      this.showFieldError('mensagem', 'Mensagem deve ter pelo menos 3 caracteres.');
      isValid = false;
    }

    return isValid;
  }

  validateField(field) {
    const value = field.value.trim();
    const fieldId = field.id;
    let error = null;

    switch (fieldId) {
      case 'nome':
        if (!value) {
          error = 'Nome é obrigatório.';
        }
        break;
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!value || !emailRegex.test(value)) {
          error = 'Email inválido.';
        }
        break;
      case 'mensagem':
        if (!value || value.length < 3) {
          error = 'Mensagem deve ter pelo menos 3 caracteres.';
        }
        break;
    }

    if (error) {
      this.showFieldError(fieldId, error);
      return false;
    }

    return true;
  }

  showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const existingError = field.parentNode.querySelector('.field-error');
    
    if (existingError) {
      existingError.remove();
    }

    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.textContent = message;
    errorElement.style.cssText = `
      color: #e74c3c;
      font-size: 0.875rem;
      margin-top: 0.25rem;
      display: block;
    `;

    field.parentNode.appendChild(errorElement);
    field.style.borderColor = '#e74c3c';
  }

  clearFieldError(field) {
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
      existingError.remove();
    }
    field.style.borderColor = '';
  }

  setLoadingState(loading) {
    if (loading) {
      this.submitButton.disabled = true;
      this.submitButton.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        Enviando...
      `;
    } else {
      this.submitButton.disabled = false;
      this.submitButton.innerHTML = `
        Enviar Mensagem
        <i class="fas fa-paper-plane"></i>
      `;
    }
  }

  showSuccess(message) {
    this.hideMessages();
    
    const successElement = document.createElement('div');
    successElement.className = 'contact-success';
    successElement.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>${message}</span>
    `;
    successElement.style.cssText = `
      background: linear-gradient(135deg, #2ecc71, #27ae60);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      animation: slideDown 0.3s ease-out;
    `;

    this.form.parentNode.insertBefore(successElement, this.form);

    // Remover após 5 segundos
    setTimeout(() => {
      if (successElement.parentNode) {
        successElement.remove();
      }
    }, 5000);

    // Adicionar animação
    if (!document.querySelector('#contactAnimations')) {
      const style = document.createElement('style');
      style.id = 'contactAnimations';
      style.textContent = `
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  showError(message) {
    this.hideMessages();
    
    const errorElement = document.createElement('div');
    errorElement.className = 'contact-error';
    errorElement.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <span>${message}</span>
    `;
    errorElement.style.cssText = `
      background: linear-gradient(135deg, #e74c3c, #c0392b);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      animation: slideDown 0.3s ease-out;
    `;

    this.form.parentNode.insertBefore(errorElement, this.form);
  }

  hideMessages() {
    const existingMessages = this.form.parentNode.querySelectorAll('.contact-success, .contact-error');
    existingMessages.forEach(msg => msg.remove());
  }

  resetForm() {
    this.form.reset();
    // Limpar errors
    const fields = this.form.querySelectorAll('input, textarea');
    fields.forEach(field => {
      this.clearFieldError(field);
    });
    // Limpar dados salvos após envio bem-sucedido
    this.clearSavedData();
  }

  // Métodos de salvamento automático
  saveFormData() {
    const formData = this.getFormData();
    const saveData = {
      ...formData,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(saveData));
    } catch (error) {
      console.warn('Não foi possível salvar dados do formulário:', error);
    }
  }

  loadSavedData() {
    try {
      const savedData = localStorage.getItem(this.storageKey);
      if (!savedData) return;

      const data = JSON.parse(savedData);
      
      // Verificar se os dados são recentes (máximo 24 horas)
      const maxAge = 24 * 60 * 60 * 1000; // 24 horas em milissegundos
      if (Date.now() - data.timestamp > maxAge) {
        this.clearSavedData();
        return;
      }

      // Verificar se estamos na mesma página
      if (data.url !== window.location.href) {
        return;
      }

      // Preencher campos com dados salvos
      if (data.nome) document.getElementById('nome').value = data.nome;
      if (data.email) document.getElementById('email').value = data.email;
      if (data.mensagem) document.getElementById('mensagem').value = data.mensagem;

      // Mostrar indicador de dados recuperados
      this.showRestoreIndicator();

    } catch (error) {
      console.warn('Erro ao carregar dados salvos:', error);
    }
  }

  clearSavedData() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn('Erro ao limpar dados salvos:', error);
    }
  }

  startAutoSave() {
    // Salvar automaticamente a cada 30 segundos
    this.autoSaveInterval = setInterval(() => {
      this.saveFormData();
    }, 30000);
  }

  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  showRestoreIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'form-restore-indicator';
    indicator.innerHTML = `
      <i class="fas fa-info-circle"></i>
      <span>Dados do formulário foram recuperados automaticamente.</span>
      <button type="button" onclick="this.parentElement.remove()">×</button>
    `;
    indicator.style.cssText = `
      background: linear-gradient(135deg, #3498db, #2980b9);
      color: white;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
      animation: slideDown 0.3s ease-out;
      position: relative;
    `;

    const button = indicator.querySelector('button');
    button.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 1.2rem;
      cursor: pointer;
      padding: 0;
      margin-left: auto;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    this.form.parentNode.insertBefore(indicator, this.form);

    // Remover automaticamente após 5 segundos
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 5000);
  }
}

// Inicializar sistema quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  new ContactSystem();
});

// Exportar para uso global
window.ContactSystem = ContactSystem;
// Allergy Scanner System with AI Analysis
class AllergyScanner {
    constructor() {
        this.currentImage = null;
        this.analysisResults = [];
        this.allergyDatabase = this.initializeAllergyDatabase();
        this.initializeEventListeners();
        this.populateAllergyTable();
    }

    // Initialize comprehensive allergy database
    initializeAllergyDatabase() {
        return {
            // Common allergens with detailed information
            allergens: [
                {
                    name: "Amendoim",
                    sources: "Manteiga de amendoim, óleo de amendoim, doces, snacks, molhos asiáticos",
                    symptoms: "Urticária, inchaço, dificuldade respiratória, anafilaxia",
                    severity: "grave",
                    keywords: ["amendoim", "peanut", "arachis", "óleo de amendoim"]
                },
                {
                    name: "Leite",
                    sources: "Leite, queijo, iogurte, manteiga, sorvete, produtos lácteos",
                    symptoms: "Dor abdominal, diarreia, vômito, eczema, asma",
                    severity: "moderada",
                    keywords: ["leite", "milk", "laticínio", "queijo", "iogurte"]
                },
                {
                    name: "Ovos",
                    sources: "Ovos, maionese, bolos, pães, massas, vacinas",
                    symptoms: "Urticária, inchaço, problemas digestivos, anafilaxia",
                    severity: "moderada",
                    keywords: ["ovo", "egg", "gema", "clara"]
                },
                {
                    name: "Trigo",
                    sources: "Pão, massas, bolos, biscoitos, cerveja, molhos",
                    symptoms: "Dor abdominal, inchaço, diarreia, fadiga",
                    severity: "leve",
                    keywords: ["trigo", "wheat", "glúten", "pão", "massa"]
                },
                {
                    name: "Soja",
                    sources: "Tofu, óleo de soja, molho shoyu, proteína vegetal, legumes",
                    symptoms: "Urticária, dor abdominal, dificuldade respiratória",
                    severity: "moderada",
                    keywords: ["soja", "soy", "tofu", "shoyu"]
                },
                {
                    name: "Frutos do Mar",
                    sources: "Camarão, lagosta, caranguejo, mexilhão, ostras",
                    symptoms: "Urticária, inchaço, dificuldade respiratória, anafilaxia",
                    severity: "grave",
                    keywords: ["camarão", "lagosta", "caranguejo", "mexilhão", "frutos do mar"]
                },
                {
                    name: "Nozes",
                    sources: "Amêndoas, castanhas, nozes, avelãs, pistaches",
                    symptoms: "Urticária, inchaço, problemas digestivos, anafilaxia",
                    severity: "grave",
                    keywords: ["amêndoa", "castanha", "noz", "avelã", "pistache"]
                },
                {
                    name: "Milho",
                    sources: "Milho, xarope de milho, amido de milho, fubá, pipoca",
                    symptoms: "Urticária, dor abdominal, vômito, diarreia",
                    severity: "leve",
                    keywords: ["milho", "corn", "xarope", "fubá"]
                },
                {
                    name: "Sésamo",
                    sources: "Gergelim, tahine, pão sírio, óleo de gergelim",
                    symptoms: "Urticária, inchaço, dificuldade respiratória, anafilaxia",
                    severity: "grave",
                    keywords: ["sésamo", "gergelim", "tahine"]
                },
                {
                    name: "Mostarda",
                    sources: "Mostarda, molhos, condimentos, conservas",
                    symptoms: "Urticária, inchaço, problemas digestivos",
                    severity: "moderada",
                    keywords: ["mostarda", "mustard", "condimento"]
                },
                {
                    name: "Lentilhas",
                    sources: "Lentilhas, feijões, grão-de-bico, ervilhas",
                    symptoms: "Dor abdominal, inchaço, problemas digestivos",
                    severity: "leve",
                    keywords: ["lentilha", "feijão", "grão-de-bico", "ervilha"]
                },
                {
                    name: "Citrinos",
                    sources: "Laranja, limão, lima, grapefruit, mandarina",
                    symptoms: "Urticária, inchaço dos lábios, problemas digestivos",
                    severity: "leve",
                    keywords: ["laranja", "limão", "lima", "citrus"]
                }
            ]
        };
    }

    // Initialize event listeners
    initializeEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const analyzeBtn = document.getElementById('analyzeBtn');

        // Click to upload
        uploadArea.addEventListener('click', () => fileInput.click());

        // File input change
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        // Analyze button
        analyzeBtn.addEventListener('click', () => this.analyzeImage());
    }

    // Handle file selection
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.handleFile(file);
        }
    }

    // Handle file processing
    handleFile(file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showError('Por favor, selecione um arquivo de imagem válido.');
            return;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            this.showError('O arquivo é muito grande. Por favor, selecione uma imagem menor que 10MB.');
            return;
        }

        // Read and display image
        const reader = new FileReader();
        reader.onload = (e) => {
            this.displayImage(e.target.result);
            this.currentImage = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Display uploaded image
    displayImage(imageSrc) {
        const previewArea = document.getElementById('previewArea');
        const previewImage = document.getElementById('previewImage');
        
        previewImage.src = imageSrc;
        previewArea.style.display = 'block';
        
        // Clear previous results
        this.clearResults();
    }

    // Clear previous results
    clearResults() {
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox empty-icon"></i>
                <p>Nenhuma análise realizada ainda</p>
                <p>Clique em "Analisar com IA" para começar</p>
            </div>
        `;
    }

    // Analyze image with AI
    async analyzeImage() {
        if (!this.currentImage) {
            this.showError('Por favor, selecione uma imagem primeiro.');
            return;
        }

        // Verificar limite do plano antes de analisar
        try {
            const planData = JSON.parse(localStorage.getItem('nutriScanPlan') || 'null');
            const plan = planData ? planData.plan : 'free';
            if (plan === 'free') {
                const history = JSON.parse(localStorage.getItem('allergyAnalysisHistory') || '[]');
                // contar scans no mês atual
                const now = new Date();
                const monthCount = history.filter(h => {
                    const d = new Date(h.timestamp || h.date || h.id);
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }).length;

                if (monthCount >= 10) {
                    this.showError('Limite de 10 scans/mês atingido para o plano gratuito. Faça upgrade para mais scans.');
                    return;
                }
            }
        } catch (e) {
            console.warn('Erro ao verificar plano:', e);
        }

        const analyzeBtn = document.getElementById('analyzeBtn');
        const originalText = analyzeBtn.innerHTML;
        
        // Show loading state
        analyzeBtn.disabled = true;
        analyzeBtn.classList.add('loading');
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';

        try {
            // Simulate AI analysis delay
            await this.simulateAIAnalysis();
            
            // Get analysis results
            const results = this.performAIAnalysis();
            
            // Display results
            this.displayResults(results);
            
            // Save to history
            this.saveAnalysisToHistory(results);
            
        } catch (error) {
            this.showError('Erro ao analisar a imagem. Por favor, tente novamente.');
            console.error('Analysis error:', error);
        } finally {
            // Reset button
            analyzeBtn.disabled = false;
            analyzeBtn.classList.remove('loading');
            analyzeBtn.innerHTML = originalText;
        }
    }

    // Simulate AI processing time
    simulateAIAnalysis() {
        return new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Perform AI analysis (simulated)
    performAIAnalysis() {
        // Simulate random detection of allergens
        const detectedAllergens = [];
        const randomAllergens = this.getRandomAllergens();
        
        randomAllergens.forEach(allergen => {
            const confidence = Math.random() * 0.3 + 0.7; // 70-100% confidence
            detectedAllergens.push({
                ...allergen,
                confidence: confidence,
                detectedAreas: this.generateDetectedAreas()
            });
        });

        // Generate overall analysis
        const overallRisk = this.calculateOverallRisk(detectedAllergens);
        
        return {
            timestamp: new Date().toISOString(),
            overallRisk: overallRisk,
            detectedAllergens: detectedAllergens,
            recommendations: this.generateRecommendations(detectedAllergens),
            imageAnalysis: this.generateImageAnalysis()
        };
    }

    // Get random allergens for simulation
    getRandomAllergens() {
        const allergens = this.allergyDatabase.allergens;
        const count = Math.floor(Math.random() * 3) + 1; // 1-3 allergens
        const shuffled = [...allergens].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    // Generate detected areas (simulated bounding boxes)
    generateDetectedAreas() {
        const areas = [];
        const count = Math.floor(Math.random() * 2) + 1; // 1-2 areas
        
        for (let i = 0; i < count; i++) {
            areas.push({
                x: Math.random() * 80 + 10, // 10-90%
                y: Math.random() * 80 + 10, // 10-90%
                width: Math.random() * 20 + 10, // 10-30%
                height: Math.random() * 20 + 10 // 10-30%
            });
        }
        
        return areas;
    }

    // Calculate overall risk level
    calculateOverallRisk(allergens) {
        if (allergens.length === 0) return 'safe';
        
        const hasGrave = allergens.some(a => a.severity === 'grave');
        const hasModerada = allergens.some(a => a.severity === 'moderada');
        
        if (hasGrave) return 'danger';
        if (hasModerada) return 'warning';
        return 'caution';
    }

    // Generate recommendations based on detected allergens
    generateRecommendations(allergens) {
        const recommendations = [];
        
        if (allergens.length === 0) {
            recommendations.push("Nenhum alérgeno comum detectado. Produto parece seguro para consumo geral.");
            return recommendations;
        }
        
        const graveAllergens = allergens.filter(a => a.severity === 'grave');
        const moderateAllergens = allergens.filter(a => a.severity === 'moderada');
        
        if (graveAllergens.length > 0) {
            recommendations.push("⚠️ **ALERTA MÁXIMO**: Detectados alérgenos de alto risco. Evitar consumo se tiver alergia grave.");
        }
        
        if (moderateAllergens.length > 0) {
            recommendations.push("⚠️ **ATENÇÃO**: Detectados alérgenos que podem causar reações moderadas.");
        }
        
        recommendations.push("📋 Verifique sempre o rótulo completo do produto.");
        recommendations.push("🏥 Em caso de reação alérgica, procure atendimento médico imediatamente.");
        recommendations.push("💊 Mantenha medicação para alergia sempre por perto se necessário.");
        
        return recommendations;
    }

    // Generate image analysis description
    generateImageAnalysis() {
        const analyses = [
            "Imagem analisada mostra produto alimentar processado com embalagem visível.",
            "Qualidade da imagem permite boa visualização dos ingredientes.",
            "Detectados possíveis alérgenos baseado em análise de padrões visuais.",
            "Recomenda-se confirmação com leitura do rótulo nutricional."
        ];
        
        return analyses.join(" ");
    }

    // Display analysis results
    displayResults(results) {
        const resultsContainer = document.getElementById('resultsContainer');
        
        let html = `
            <div class="result-card ${results.overallRisk}">
                <div class="result-header">
                    <h3 class="result-title">Análise Completa</h3>
                    <span class="result-severity severity-${results.overallRisk}">
                        ${this.getSeverityText(results.overallRisk)}
                    </span>
                </div>
                <div class="result-description">
                    ${results.imageAnalysis}
                </div>
                <div class="allergen-list">
                    ${results.detectedAllergens.map(allergen => 
                        `<span class="allergen-tag ${allergen.severity === 'grave' ? 'danger' : allergen.severity === 'moderada' ? 'warning' : ''}">
                            ${allergen.name} (${Math.round(allergen.confidence * 100)}%)
                        </span>`
                    ).join('')}
                </div>
            </div>
        `;
        
        // Add detailed allergen information
        results.detectedAllergens.forEach(allergen => {
            html += `
                <div class="result-card ${allergen.severity === 'grave' ? 'danger' : allergen.severity === 'moderada' ? 'warning' : ''}">
                    <div class="result-header">
                        <h3 class="result-title">${allergen.name}</h3>
                        <span class="result-severity severity-${allergen.severity === 'grave' ? 'danger' : allergen.severity === 'moderada' ? 'warning' : 'caution'}">
                            ${allergen.severity}
                        </span>
                    </div>
                    <div class="result-description">
                        <strong>Fontes Comuns:</strong> ${allergen.sources}<br>
                        <strong>Sintomas:</strong> ${allergen.symptoms}<br>
                        <strong>Confiança da IA:</strong> ${Math.round(allergen.confidence * 100)}%
                    </div>
                </div>
            `;
        });
        
        // Add recommendations
        html += `
            <div class="result-card">
                <div class="result-header">
                    <h3 class="result-title">Recomendações</h3>
                </div>
                <div class="result-description">
                    ${results.recommendations.map(rec => `<p>${rec}</p>`).join('')}
                </div>
            </div>
        `;
        
        resultsContainer.innerHTML = html;
    }

    // Get severity text in Portuguese
    getSeverityText(severity) {
        const texts = {
            'safe': 'Seguro',
            'caution': 'Cuidado',
            'warning': 'Atenção',
            'danger': 'Perigo'
        };
        return texts[severity] || 'Desconhecido';
    }

    // Save analysis to history
    saveAnalysisToHistory(results) {
        const history = JSON.parse(localStorage.getItem('allergyAnalysisHistory') || '[]');
        const analysis = {
            ...results,
            id: Date.now(),
            image: this.currentImage
        };
        
        history.unshift(analysis);
        
        // Keep only last 50 analyses
        if (history.length > 50) {
            history.splice(50);
        }
        
        localStorage.setItem('allergyAnalysisHistory', JSON.stringify(history));
        
        // Também adicionar entrada simplificada em nutriScanScans para o dashboard
        try {
            const scans = JSON.parse(localStorage.getItem('nutriScanScans') || '[]');
            const scanEntry = {
                id: analysis.id,
                product: 'Imagem analisada',
                date: analysis.timestamp || new Date().toISOString(),
                status: (analysis.overallRisk === 'safe' ? 'safe' : (analysis.overallRisk === 'warning' ? 'warning' : 'danger')),
                confidence: analysis.detectedAllergens && analysis.detectedAllergens[0] ? Math.round(analysis.detectedAllergens[0].confidence * 100) : 90,
                image: analysis.image || this.currentImage || ''
            };
            scans.unshift(scanEntry);
            // manter 100 scans locais
            if (scans.length > 100) scans.splice(100);
            localStorage.setItem('nutriScanScans', JSON.stringify(scans));
        } catch (e) {
            console.warn('Erro ao adicionar scan simplificado:', e);
        }

        // Notificar o dashboard em tempo real na mesma aba
        try {
            // Disparar evento DOM para listeners na página
            const event = new CustomEvent('scan:completed', { detail: scanEntry });
            document.dispatchEvent(event);

            // Se houver um sincronizador real-time global, chamar o handler diretamente
            if (window.realtimeSync && typeof window.realtimeSync.handleScanUpdate === 'function') {
                window.realtimeSync.handleScanUpdate(scanEntry);
            }
        } catch (e) {
            // não bloquear fluxo se notificação falhar
            console.warn('Erro ao notificar dashboard sobre novo scan:', e);
        }

        // Atualizar contador de uso do plano no usuário local
        try {
            const userStr = localStorage.getItem('nutriScanUser');
            if (userStr) {
                const user = JSON.parse(userStr);
                user.subscription = user.subscription || {};
                user.subscription.scansUsed = (user.subscription.scansUsed || 0) + 1;
                localStorage.setItem('nutriScanUser', JSON.stringify(user));
            }
        } catch (e) {
            console.warn('Erro ao atualizar uso do plano do usuário:', e);
        }
        
        // Incluir dados do usuário e notificar histórico (outras abas)
        try {
            const userStr = localStorage.getItem('nutriScanUser');
            if (userStr) {
                const user = JSON.parse(userStr);
                analysis.user = { name: user.name || 'Usuário', id: user.id || null };
            }
        } catch (e) {
            // ignore
        }

        try {
            localStorage.setItem('allergyAnalysisLast', JSON.stringify(analysis));
            localStorage.setItem('allergyAnalysisLastUpdate', Date.now().toString());
        } catch (e) {
            console.warn('Erro ao sinalizar atualização de histórico:', e);
        }
    }

    // Populate allergy table
    populateAllergyTable() {
        const tableBody = document.getElementById('allergyTableBody');
        
        const html = this.allergyDatabase.allergens.map(allergen => `
            <tr>
                <td class="allergy-name">${allergen.name}</td>
                <td>${allergen.sources}</td>
                <td class="allergy-symptoms">${allergen.symptoms}</td>
                <td class="allergy-severity">
                    <span class="severity-badge severity-${allergen.severity === 'grave' ? 'danger' : allergen.severity === 'moderada' ? 'warning' : 'caution'}">
                        ${allergen.severity}
                    </span>
                </td>
            </tr>
        `).join('');
        
        tableBody.innerHTML = html;
    }

    // Show error message
    showError(message) {
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.innerHTML = `
            <div class="result-card danger">
                <div class="result-header">
                    <h3 class="result-title">Erro</h3>
                </div>
                <div class="result-description">
                    ${message}
                </div>
            </div>
        `;
    }
}

// Initialize the allergy scanner when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AllergyScanner();
});

// Nota: `safeRedirect` é centralizado em `api-config.js`.
// Verificador de Arquivos - Safe-Bite
// Garante que os arquivos existam antes de redirecionar

class FileChecker {
  constructor() {
    this.availableFiles = new Set();
    this.init();
  }

  init() {
    // SPA - Single Page Application, não verifica arquivos
    // Configura redirecionamento seguro baseado em hash
    this.setupGlobalRedirect();
  }

  setupGlobalRedirect() {
    // Criar função segura de redirecionamento para SPA
    window.safeRedirect = (url) => {
      // Converter URLs de arquivo para hash routing
      if (url.endsWith('.html')) {
        const pageMap = {
          'index.html': '#home',
          'login.html': '#login',
          'signup.html': '#signup',
          'dashboard.html': '#dashboard',
          'payment.html': '#payment'
        };
        const hash = pageMap[url] || '#home';
        console.log(`🔄 Convertendo ${url} para ${hash}`);
        window.location.hash = hash;
        return;
      }
      
      // Se já for hash, usar diretamente
      if (url.startsWith('#')) {
        window.location.hash = url;
        return;
      }
      
      console.log(`✅ Redirecionando para: ${url}`);
      window.location.href = url;
    };

    // Interceptar cliques em links para converter .html para hash
    document.addEventListener('click', (event) => {
      const target = event.target.closest('a[href]');
      if (target) {
        const href = target.getAttribute('href');
        
        // Converter links .html para hash routing
        if (href && href.endsWith('.html')) {
          event.preventDefault();
          const pageMap = {
            'index.html': '#home',
            'login.html': '#login',
            'signup.html': '#signup',
            'dashboard.html': '#dashboard',
            'payment.html': '#payment'
          };
          const hash = pageMap[href] || '#home';
          console.log(`🔄 Convertendo link ${href} para ${hash}`);
          window.location.hash = hash;
        }
      }
    }, true);

    console.log('✅ Sistema de redirecionamento SPA ativado');
  }

  // Verificar se hash específico existe (sempre true em SPA)
  hashExists(hash) {
    return true;
  }

  // Obter lista de hashes disponíveis
  getAvailableHashes() {
    return ['#home', '#login', '#signup', '#dashboard', '#scanner', '#payment', '#settings', '#profile', '#history', '#plans', '#allergy-scanner', '#help'];
  }

  // Redirecionamento seguro baseado em hash
  safeRedirectTo(hash) {
    if (!hash.startsWith('#')) {
      hash = '#' + hash;
    }
    window.location.hash = hash;
  }
}

// Nota: não definir diretamente `window.safeRedirect` aqui para evitar
// sobrescrever implementações centrais. Expor `fileChecker.safeRedirectTo`.

// Inicializar verificador
let fileChecker;
document.addEventListener('DOMContentLoaded', () => {
  fileChecker = new FileChecker();
  window.fileChecker = fileChecker;
  // Registrar helpers globais apenas se ainda não existirem
  if (!window.safeRedirect) {
    window.safeRedirect = (url) => fileChecker.safeRedirectTo(url);
  }
  if (!window.safeLogin) {
    window.safeLogin = () => { window.location.hash = 'login'; };
  }
  if (!window.safeSignup) {
    window.safeSignup = () => { window.location.hash = 'signup'; };
  }
  if (!window.safeDashboard) {
    window.safeDashboard = () => { window.location.hash = 'dashboard'; };
  }
  if (!window.safeIndex) {
    window.safeIndex = () => { window.location.hash = 'home'; };
  }
  
  console.log('🛡️ FileChecker inicializado');
  console.log('📋 Funções seguras disponíveis: safeRedirect, safeLogin, safeSignup, safeDashboard, safeIndex');
});
/**
 * Settings Buttons Manager
 * Gerencia as funções dos botões da página de configurações
 * Com animações de deslize para os lados
 */

class SettingsButtonsManager {
  constructor() {
    this.initializeButtons();
  }

  /**
   * Inicializa todos os botões com listeners
   */
//   initializeButtons() {
//     // Salvar
//     const saveBtn = document.querySelector('button[onclick="saveSettings()"]');
//     if (saveBtn) {
//       saveBtn.addEventListener('click', (e) => this.slideOutAction(e, this.handleSaveSettings.bind(this)));
//     }

//     // Exportar
//     const exportBtn = document.querySelector('button[onclick="exportData()"]');
//     if (exportBtn) {
//       exportBtn.addEventListener('click', (e) => this.slideOutAction(e, this.handleExportData.bind(this)));
//     }

//     // Limpar Histórico
//     const clearBtn = document.querySelector('button[onclick="clearHistory()"]');
//     if (clearBtn) {
//       clearBtn.addEventListener('click', (e) => this.slideOutAction(e, this.handleClearHistory.bind(this)));
//     }

//     // Sair
//     const logoutBtn = document.querySelector('button[onclick="logout()"]');
//     if (logoutBtn) {
//       logoutBtn.addEventListener('click', (e) => this.slideOutAction(e, this.handleLogout.bind(this)));
//     }

//     // Limpar Cache
//     const cacheBtn = document.querySelector('button[onclick="clearCache()"]');
//     if (cacheBtn) {
//       cacheBtn.addEventListener('click', (e) => this.slideOutAction(e, this.handleClearCache.bind(this)));
//     }

//     // Restaurar Padrão
//     const resetBtn = document.querySelector('button[onclick="resetSettings()"]');
//     if (resetBtn) {
//       resetBtn.addEventListener('click', (e) => this.slideOutAction(e, this.handleResetSettings.bind(this)));
//     }
//   }

  /**
   * Animação de deslize para o lado quando o botão é clicado
   * @param {Event} e - Evento do clique
   * @param {Function} callback - Função a executar após a animação
   */
  slideOutAction(e, callback) {
    e.preventDefault();
    const button = e.target.closest('button');

    // Adicionar classe de animação de deslize
    button.classList.add('slide-out-right');

    // Executar callback após a animação
    setTimeout(() => {
      callback();
      button.classList.remove('slide-out-right');
      // Animar de volta
      button.style.animation = 'slideInLeft 0.5s ease forward';
      setTimeout(() => {
        button.style.animation = '';
      }, 500);
    }, 400);
  }

  /**
   * Salvar configurações
   */
  handleSaveSettings() {
    console.log('✅ Salvando configurações...');
    
    // Simular salvamento
    this.showNotification('Configurações salvas com sucesso!', 'success');
    
    // Adicionar efeito visual no botão
    this.addPulseEffect();
  }

  /**
   * Exportar dados
   */
  handleExportData() {
    console.log('📥 Exportando dados...');
    
    // Simular exportação
    this.showNotification('Dados exportados com sucesso!', 'success');
    
    // Adicionar efeito de download
    this.addDownloadEffect();
  }

  /**
   * Limpar histórico
   */
  handleClearHistory() {
    if (confirm('Tem certeza que deseja limpar todo o histórico? Esta ação não pode ser desfeita.')) {
      console.log('🗑️ Limpando histórico...');
      this.showNotification('Histórico limpo com sucesso!', 'success');
      this.addTrashEffect();
    }
  }

  /**
   * Logout
   */
  handleLogout() {
    if (confirm('Tem certeza que deseja sair da sua conta?')) {
      console.log('👋 Saindo da conta...');
      this.showNotification('Saindo da conta...', 'warning');
      
      // Simular logout após animação
      setTimeout(() => {
        localStorage.removeItem('nutriScanToken');
        localStorage.removeItem('nutriScanUser');
            window.location.hash = 'home';
      }, 500);
    }
  }

  /**
   * Limpar cache
   */
  handleClearCache() {
    console.log('🧹 Limpando cache...');
    this.showNotification('Cache limpo com sucesso!', 'success');
    this.addBroomEffect();
  }

  /**
   * Restaurar configurações padrão
   */
  handleResetSettings() {
    if (confirm('Tem certeza que deseja restaurar todas as configurações ao padrão?')) {
      console.log('🔄 Restaurando configurações padrão...');
      this.showNotification('Configurações restauradas ao padrão!', 'warning');
      
      // Limpar localStorage
      localStorage.removeItem('nutriscan_settings');
      
      // Recarregar página
      setTimeout(() => {
        location.reload();
      }, 1000);
    }
  }

  /**
   * Mostrar notificação na tela
   * @param {string} message - Mensagem a exibir
   * @param {string} type - Tipo: 'success', 'warning', 'error'
   */
  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <i class="fas fa-${this.getIconByType(type)}"></i>
      <span>${message}</span>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background: ${this.getColorByType(type)};
      color: white;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      gap: 0.8rem;
      font-weight: 500;
      z-index: 9999;
      animation: slideInRight 0.5s ease;
    `;

    document.body.appendChild(notification);

    // Remover após 3 segundos
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.5s ease';
      setTimeout(() => {
        notification.remove();
      }, 500);
    }, 3000);
  }

  /**
   * Obter ícone baseado no tipo de notificação
   * @param {string} type - Tipo de notificação
   * @returns {string} Nome do ícone Font Awesome
   */
  getIconByType(type) {
    const icons = {
      success: 'check-circle',
      warning: 'exclamation-circle',
      error: 'times-circle'
    };
    return icons[type] || 'info-circle';
  }

  /**
   * Obter cor baseada no tipo de notificação
   * @param {string} type - Tipo de notificação
   * @returns {string} Cor em formato gradiente
   */
  getColorByType(type) {
    const colors = {
      success: 'linear-gradient(135deg, #2ecc71, #27ae60)',
      warning: 'linear-gradient(135deg, #f39c12, #e67e22)',
      error: 'linear-gradient(135deg, #e74c3c, #c0392b)'
    };
    return colors[type] || 'linear-gradient(135deg, #3498db, #2980b9)';
  }

  /**
   * Adicionar efeito de pulso
   */
  addPulseEffect() {
    const button = document.querySelector('button[onclick="saveSettings()"]');
    if (button) {
      button.style.animation = 'pulse 0.6s ease';
      setTimeout(() => {
        button.style.animation = '';
      }, 600);
    }
  }

  /**
   * Adicionar efeito de download
   */
  addDownloadEffect() {
    const button = document.querySelector('button[onclick="exportData()"]');
    if (button) {
      const icon = button.querySelector('i');
      if (icon) {
        icon.style.animation = 'bounce 0.6s ease';
        setTimeout(() => {
          icon.style.animation = '';
        }, 600);
      }
    }
  }

  /**
   * Adicionar efeito de lixo
   */
  addTrashEffect() {
    const button = document.querySelector('button[onclick="clearHistory()"]');
    if (button) {
      button.style.animation = 'shake 0.5s ease';
      setTimeout(() => {
        button.style.animation = '';
      }, 500);
    }
  }

  /**
   * Adicionar efeito de vassoura
   */
  addBroomEffect() {
    const button = document.querySelector('button[onclick="clearCache()"]');
    if (button) {
      const icon = button.querySelector('i');
      if (icon) {
        icon.style.animation = 'rotate 0.6s ease';
        setTimeout(() => {
          icon.style.animation = '';
        }, 600);
      }
    }
  }
}

// Inicializar quando o DOM carregar
document.addEventListener('DOMContentLoaded', () => {
  new SettingsButtonsManager();
});
// Real-time Dashboard Sync System
class RealtimeDashboardSync {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.syncInterval = null;
        this.lastSyncTime = null;
        this.isOnline = navigator.onLine;
        this.cache = new Map();
        
        this.initializeEventListeners();
        this.startPeriodicSync();
    }

    // Initialize event listeners
    initializeEventListeners() {
        // Network status monitoring
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.handleReconnect();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.handleDisconnect();
        });

        // Page visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.syncData();
            }
        });

        // WebSocket connection events
        window.addEventListener('beforeunload', () => {
            this.disconnect();
        });
    }

    // Initialize WebSocket connection for real-time updates
    initializeWebSocket() {
        if (!this.isOnline) return;

        try {
            // Simulated WebSocket URL (replace with actual WebSocket server)
            const wsUrl = `ws://localhost:3000/dashboard-sync`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('🔌 WebSocket connected');
                this.reconnectAttempts = 0;
                this.requestInitialData();
            };

            this.ws.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };

            this.ws.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                this.handleReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('🔌 WebSocket error:', error);
                this.handleReconnect();
            };

        } catch (error) {
            console.error('🔌 Failed to initialize WebSocket:', error);
            this.startPeriodicSync();
        }
    }

    // Handle WebSocket messages
    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'initial_data':
                    this.updateDashboard(data.payload);
                    break;
                case 'scan_update':
                    this.handleScanUpdate(data.payload);
                    break;
                case 'stats_update':
                    this.updateStats(data.payload);
                    break;
                case 'plan_update':
                    this.updatePlanUsage(data.payload);
                    break;
                case 'user_activity':
                    this.handleUserActivity(data.payload);
                    break;
                default:
                    console.log('🔌 Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('🔌 Error parsing WebSocket message:', error);
        }
    }

    // Handle scan updates in real-time
    handleScanUpdate(scanData) {
        // Update local cache
        this.cache.set(`scan_${scanData.id}`, scanData);
        
        // Update dashboard counters
        this.updateScanCounters(scanData);
        
        // Show real-time notification
        this.showRealtimeNotification(scanData);
        
        // Update recent scans list
        this.updateRecentScans(scanData);
        
        // Trigger animation
        this.animateCounter('totalScans');
    }

    // Update scan counters
    updateScanCounters(scanData) {
        const totalScansEl = document.getElementById('totalScans');
        const safeProductsEl = document.getElementById('safeProducts');
        const warningsFoundEl = document.getElementById('warningsFound');
        
        if (totalScansEl) {
            const current = parseInt(totalScansEl.textContent) || 0;
            totalScansEl.textContent = current + 1;
        }
        
        if (scanData.status === 'safe' && safeProductsEl) {
            const current = parseInt(safeProductsEl.textContent) || 0;
            safeProductsEl.textContent = current + 1;
        }
        
        if ((scanData.status === 'warning' || scanData.status === 'danger') && warningsFoundEl) {
            const current = parseInt(warningsFoundEl.textContent) || 0;
            warningsFoundEl.textContent = current + 1;
        }
    }

    // Show real-time notification
    showRealtimeNotification(scanData) {
        const notification = document.createElement('div');
        notification.className = 'realtime-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${scanData.status === 'safe' ? 'check-circle' : 'exclamation-triangle'}"></i>
                <span>Novo scan: ${scanData.product}</span>
                <span class="status-${scanData.status}">${this.getStatusText(scanData.status)}</span>
            </div>
        `;
        
        // Add notification styles if not exists
        if (!document.getElementById('realtime-notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'realtime-notification-styles';
            styles.textContent = `
                .realtime-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    border-radius: 10px;
                    padding: 1rem 1.5rem;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    z-index: 1000;
                    animation: slideInRight 0.5s ease;
                    max-width: 300px;
                }
                
                .notification-content {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                
                .notification-content i {
                    color: var(--primary-green);
                }
                
                .status-safe { color: var(--success-green); }
                .status-warning { color: var(--warning-orange); }
                .status-danger { color: var(--danger-red); }
                
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.5s ease';
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    }

    // Update recent scans list
    updateRecentScans(scanData) {
        const recentScansList = document.getElementById('recentScansList');
        if (!recentScansList) return;
        
        // Create new scan item
        const scanItem = document.createElement('div');
        scanItem.className = 'scan-item';
        scanItem.innerHTML = `
            <div class="scan-info">
                <div class="scan-product">${scanData.product}</div>
                <div class="scan-date">${new Date(scanData.date).toLocaleString('pt-BR')}</div>
            </div>
            <div class="scan-status status-${scanData.status}">
                <i class="fas fa-${this.getStatusIcon(scanData.status)}"></i>
                ${this.getStatusText(scanData.status)}
            </div>
        `;
        
        // Add to top of list
        recentScansList.insertBefore(scanItem, recentScansList.firstChild);
        
        // Remove last item if more than 5
        const items = recentScansList.querySelectorAll('.scan-item');
        if (items.length > 5) {
            items[items.length - 1].remove();
        }
        
        // Add animation
        scanItem.style.animation = 'slideInLeft 0.5s ease';
    }

    // Get status text
    getStatusText(status) {
        const texts = {
            'safe': 'Seguro',
            'warning': 'Atenção',
            'danger': 'Perigo'
        };
        return texts[status] || 'Desconhecido';
    }

    // Get status icon
    getStatusIcon(status) {
        const icons = {
            'safe': 'check-circle',
            'warning': 'exclamation-triangle',
            'danger': 'times-circle'
        };
        return icons[status] || 'question-circle';
    }

    // Start periodic sync (fallback when WebSocket is not available)
    startPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        this.syncInterval = setInterval(() => {
            if (this.isOnline && !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.syncData();
            }
        }, 5000); // Sync every 5 seconds
    }

    // Sync data with server
    async syncData() {
        if (!this.isOnline) return;
        
        try {
            const response = await fetch('/api/dashboard/stats', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateDashboard(data);
                this.lastSyncTime = new Date();
                console.log('🔄 Dashboard synced successfully');
                // Após buscar estatísticas, tentar enviar alterações locais (análises/exclusões)
                await this.pushPendingUpdates();
            }
        } catch (error) {
            console.error('🔄 Sync error:', error);
            // Use cached data if available
            this.loadFromCache();
        }
    }

    // Push local pending updates (new analysis or deletions) to server
    async pushPendingUpdates() {
        try {
            // Push last analysis if exists
            const last = JSON.parse(localStorage.getItem('allergyAnalysisLast') || 'null');
            const lastUpdate = localStorage.getItem('allergyAnalysisLastUpdate');
            const pushedMarker = localStorage.getItem('realtime_last_pushed') || '';

            if (last && lastUpdate && pushedMarker !== String(lastUpdate)) {
                // POST to server
                try {
                    const resp = await fetch('/api/scans', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}` },
                        body: JSON.stringify(last)
                    });

                    if (resp.ok) {
                        console.log('🔼 Pushed last analysis to server');
                        localStorage.setItem('realtime_last_pushed', String(lastUpdate));
                        // notify via websocket if connected
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.send(JSON.stringify({ type: 'scan_update', payload: last }));
                        }
                    }
                } catch (e) {
                    console.warn('Failed to push last analysis:', e);
                }
            }

            // Handle deletions
            const deleted = JSON.parse(localStorage.getItem('allergyAnalysisDeleted') || 'null');
            const deletedMarker = localStorage.getItem('realtime_last_deleted') || '';
            if (deleted && deleted.ts && String(deleted.ts) !== deletedMarker) {
                try {
                    const resp = await fetch(`/api/scans/${deleted.id}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}` }
                    });

                    if (resp.ok || resp.status === 404) {
                        console.log('🔽 Pushed deletion to server for', deleted.id);
                        localStorage.setItem('realtime_last_deleted', String(deleted.ts));
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.send(JSON.stringify({ type: 'scan_delete', payload: { id: deleted.id } }));
                        }
                    }
                } catch (e) {
                    console.warn('Failed to push deletion:', e);
                }
            }
        } catch (e) {
            console.warn('pushPendingUpdates error:', e);
        }
    }

    // Update dashboard with new data
    updateDashboard(data) {
        // Update counters with animation
        this.updateCounter('totalScans', data.totalScans);
        this.updateCounter('safeProducts', data.safeProducts);
        this.updateCounter('warningsFound', data.warningsFound);
        this.updateCounter('planUsage', `${data.planUsage}/${data.planLimit}`);
        
        // Update plan usage progress
        this.updatePlanProgress(data.planUsage, data.planLimit);
        
        // Cache the data
        this.cache.set('dashboard_data', data);
    }

    // Update counter with animation
    updateCounter(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const oldValue = parseInt(element.textContent) || 0;
        const targetValue = typeof newValue === 'string' ? newValue : parseInt(newValue);
        
        if (oldValue !== targetValue) {
            this.animateCounter(elementId, oldValue, targetValue);
        }
    }

    // Animate counter change
    animateCounter(elementId, start, end) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = Math.floor(start + (end - start) * progress);
            element.textContent = current;
            
            // Add pulse effect
            if (progress === 1) {
                element.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    element.style.transform = 'scale(1)';
                }, 200);
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Update plan usage progress
    updatePlanProgress(usage, limit) {
        const progressBar = document.getElementById('planProgressBar');
        if (!progressBar) return;
        
        const percentage = (usage / limit) * 100;
        progressBar.style.width = `${percentage}%`;
        
        // Change color based on usage
        if (percentage >= 90) {
            progressBar.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
        } else if (percentage >= 70) {
            progressBar.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
        } else {
            progressBar.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
        }
    }

    // Handle reconnection
    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            setTimeout(() => {
                this.initializeWebSocket();
            }, this.reconnectDelay * this.reconnectAttempts);
        } else {
            console.log('🔄 Max reconnection attempts reached, using periodic sync');
            this.startPeriodicSync();
        }
    }

    // Handle disconnection
    handleDisconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // Show offline indicator
        this.showOfflineIndicator();
    }

    // Show offline indicator
    showOfflineIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.innerHTML = `
            <i class="fas fa-wifi"></i>
            <span>Offline - Modo desconectado</span>
        `;
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #e74c3c;
            color: white;
            padding: 0.8rem 1.2rem;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            z-index: 1000;
            animation: slideUp 0.5s ease;
        `;
        
        document.body.appendChild(indicator);
    }

    // Hide offline indicator
    hideOfflineIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // Load data from cache
    loadFromCache() {
        const cachedData = this.cache.get('dashboard_data');
        if (cachedData) {
            this.updateDashboard(cachedData);
            console.log('📦 Loaded data from cache');
        }
    }

    // Request initial data
    requestInitialData() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'request_initial_data',
                userId: localStorage.getItem('nutriScanUser')
            }));
        }
    }

    // Disconnect WebSocket
    disconnect() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // Get connection status
    getConnectionStatus() {
        return {
            isOnline: this.isOnline,
            websocketConnected: this.ws && this.ws.readyState === WebSocket.OPEN,
            lastSyncTime: this.lastSyncTime,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// Initialize the real-time sync system
let realtimeSync;

document.addEventListener('DOMContentLoaded', () => {
    realtimeSync = new RealtimeDashboardSync();
    
    // Make it globally accessible
    window.realtimeSync = realtimeSync;
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealtimeDashboardSync;
}
// Sistema de Integração de Sincronização de Usuário
// Integra o user-sync.js com o sistema principal

document.addEventListener('DOMContentLoaded', function() {
    console.log('Sistema de sincronização de usuário integrado');
    
    // Verificar se há usuário sincronizado
    const syncedUser = localStorage.getItem('syncedUser');
    const currentUser = localStorage.getItem('nutriScanUser');
    
    if (syncedUser && !currentUser) {
        // Restaurar usuário sincronizado
        localStorage.setItem('nutriScanUser', syncedUser);
        console.log('Usuário restaurado da sincronização');
    }
    
    // Sincronizar dados quando houver mudanças
    window.addEventListener('storage', function(e) {
        if (e.key === 'nutriScanUser') {
            localStorage.setItem('syncedUser', e.newValue);
            console.log('Usuário sincronizado automaticamente');
        }
    });
    
    // Função para forçar sincronização
    window.forceUserSync = function() {
        const user = localStorage.getItem('nutriScanUser');
        if (user) {
            localStorage.setItem('syncedUser', user);
            console.log('Sincronização forçada realizada');
            return true;
        }
        return false;
    };
});
/**
 * Integração com Mercado Pago - QR Code PIX
 * Gera QR Codes para pagamentos PIX usando a API do Mercado Pago
 */

class MercadoPagoPixIntegration {
  constructor() {
    this.accessToken = localStorage.getItem('mercadopagoToken') || null;
    this.userId = localStorage.getItem('mercadopagoUserId') || null;
    this.baseURL = 'https://api.mercadopago.com/v1';
    this.publicKey = null;
    this.init();
  }

  /**
   * Inicializar e configurar a integração
   */
  async init() {
    try {
      // Carrega configuração do backend
      const response = await fetch('/api/payment/mercadopago-config', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}`
        }
      });
      
      if (response.ok) {
        const config = await response.json();
        this.publicKey = config.publicKey;
      }
    } catch (error) {
      console.warn('Não foi possível carregar configuração do Mercado Pago:', error);
    }
  }

  /**
   * Gerar QR Code PIX via API do Mercado Pago
   * @param {number} amount - Valor da transação
   * @param {string} description - Descrição do pagamento
   * @param {object} customer - Dados do cliente
   * @returns {Promise<object>} QR Code e dados do pagamento
   */
  async generatePixQRCode(amount, description, customer) {
    try {
      // Validar dados obrigatórios
      if (!amount || amount <= 0) {
        throw new Error('Valor deve ser maior que 0');
      }

      if (!customer || !customer.email) {
        throw new Error('Email do cliente é obrigatório');
      }

      // Enviar requisição para backend que integrará com Mercado Pago
      const response = await fetch('/api/payment/mercadopago-pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}`
        },
        body: JSON.stringify({
          amount,
          description: description || 'Pagamento Safe-Bite',
          customerInfo: {
            name: customer.name || 'Cliente',
            email: customer.email,
            cpf: customer.cpf || null,
            phone: customer.phone || null
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao gerar QR Code');
      }

      const data = await response.json();
      return this.formatPixResponse(data);
    } catch (error) {
      console.error('Erro ao gerar QR Code PIX:', error);
      throw error;
    }
  }

  /**
   * Formatar resposta do Mercado Pago
   */
  formatPixResponse(data) {
    return {
      success: true,
      type: 'pix',
      provider: 'mercadopago',
      qrCode: data.qr_code || data.qrCode,
      qrImage: data.qr_image || data.qrImage,
      copyPaste: data.qr_code || data.qrCode,
      transactionId: data.id || data.transaction_id,
      amount: data.amount,
      status: 'pending',
      expiresAt: data.expires_at || new Date(Date.now() + 3600000),
      createdAt: new Date(),
      paymentLink: data.payment_link || null
    };
  }

  /**
   * Verificar status do pagamento
   */
  async checkPixStatus(transactionId) {
    try {
      const response = await fetch(`/api/payment/mercadopago-pix/${transactionId}/status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Erro ao verificar status do pagamento');
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      throw error;
    }
  }

  /**
   * Monitorar pagamento com webhook
   */
  setupWebhookListener(transactionId, callback) {
    const checkInterval = setInterval(async () => {
      try {
        const status = await this.checkPixStatus(transactionId);
        
        if (status.status === 'paid' || status.status === 'approved') {
          clearInterval(checkInterval);
          callback({ success: true, status: 'paid', data: status });
        }
      } catch (error) {
        console.error('Erro ao verificar webhook:', error);
      }
    }, 3000); // Verificar a cada 3 segundos

    return () => clearInterval(checkInterval);
  }

  /**
   * Criar pagamento com checkout redirect
   */
  async createCheckoutPreference(items, payerInfo) {
    try {
      const response = await fetch('/api/payment/mercadopago-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}`
        },
        body: JSON.stringify({
          items,
          payer: payerInfo,
          auto_return: 'approved'
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao criar preferência de checkout');
      }

      const data = await response.json();
      return {
        success: true,
        checkoutUrl: data.init_point,
        preferenceId: data.id
      };
    } catch (error) {
      console.error('Erro ao criar checkout:', error);
      throw error;
    }
  }

  /**
   * Listar métodos de pagamento disponíveis
   */
  async getPaymentMethods() {
    try {
      const response = await fetch('/api/payment/methods', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('nutriScanToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Erro ao listar métodos de pagamento');
      }

      return await response.json();
    } catch (error) {
      console.error('Erro ao listar métodos:', error);
      throw error;
    }
  }

  /**
   * Copiar código PIX para clipboard
   */
  copyPixCode(pixCode) {
    try {
      navigator.clipboard.writeText(pixCode);
      return { success: true, message: 'Código PIX copiado!' };
    } catch (error) {
      console.error('Erro ao copiar:', error);
      return { success: false, message: 'Erro ao copiar código' };
    }
  }

  /**
   * Baixar QR Code como imagem
   */
  downloadQRCode(qrImageUrl, fileName = 'qrcode-pix.png') {
    try {
      const link = document.createElement('a');
      link.href = qrImageUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return { success: true, message: 'QR Code baixado!' };
    } catch (error) {
      console.error('Erro ao baixar QR Code:', error);
      return { success: false, message: 'Erro ao baixar QR Code' };
    }
  }
}

// Instância global
const mercadoPagoPixService = new MercadoPagoPixIntegration();
/**
 * payment-integration.js
 * Camada de integração e fallback automático para payment manager
 * Conecta #payment -> payment-manager
 * Com fallback para payment-mock.js quando servidor está offline
 */

class PaymentIntegration {
  constructor() {
    this.manager = null;
    this.mock = null;
    this.isServerAvailable = false;
    this.usesMockData = false;
    this.initPromise = this.initialize();
  }

  async initialize() {
    try {
      // Verificar se o servidor está disponível
      const healthCheck = await this.checkServerHealth();
      this.isServerAvailable = healthCheck;

      if (healthCheck) {
        console.log('✓ Servidor de pagamento disponível');
        this.manager = paymentManager;
        this.usesMockData = false;
      } else {
        console.warn('⚠ Servidor de pagamento indisponível. Usando modo de teste.');
        this.mock = paymentMockService;
        this.usesMockData = true;
      }
    } catch (error) {
      console.error('✗ Erro ao inicializar sistema de pagamento:', error);
      this.mock = paymentMockService;
      this.usesMockData = true;
    }
  }

  async checkServerHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('http://localhost:5000/api/health', {
        signal: controller.signal,
        method: 'GET'
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Servidor de pagamento não respondeu (timeout)');
      } else {
        console.warn('Servidor de pagamento indisponível');
      }
      return false;
    }
  }

  async ensureInitialized() {
    await this.initPromise;
  }

  // ── Métodos públicos ────────────────────────────────────

  async getPaymentMethods() {
    await this.ensureInitialized();

    if (this.usesMockData) {
      return this.mock.getMockPaymentMethods();
    }
    return this.manager.getPaymentMethods();
  }

  async generatePIX(amount, description) {
    await this.ensureInitialized();

    if (this.usesMockData) {
      return this.mock.generateMockPIX(amount, description);
    }
    return this.manager.generatePIX(amount, description);
  }

  async generateBoleto(amount, address) {
    await this.ensureInitialized();

    if (this.usesMockData) {
      const customerInfo = await this.manager.getCustomerInfo();
      return this.mock.generateMockBoleto(amount, { ...customerInfo, address });
    }
    return this.manager.generateBoleto(amount, address);
  }

  async processCardPayment(token, amount, installments) {
    await this.ensureInitialized();

    if (this.usesMockData) {
      return this.mock.processMockCardPayment(token, amount, installments);
    }
    return this.manager.processCardPayment(token, amount, installments);
  }

  async getPaymentStatus(paymentId) {
    await this.ensureInitialized();

    if (this.usesMockData) {
      return this.mock.getMockPaymentStatus(paymentId);
    }
    return this.manager.getPaymentStatus(paymentId);
  }

  async getCustomerInfo() {
    await this.ensureInitialized();
    if (this.usesMockData) {
      if (this.mock.getMockCustomerInfo) {
        return await this.mock.getMockCustomerInfo();
      }

      // Fallback: pegar primeiro usuário mock
      if (this.mock && this.mock.mockUsers) {
        const keys = Object.keys(this.mock.mockUsers);
        const u = this.mock.mockUsers[keys[0]] || {};
        return {
          name: u.name || 'Cliente',
          email: u.email || '',
          cpf: u.cpf || ''
        };
      }

      return { name: 'Cliente', email: '', cpf: '' };
    }

    return await this.manager.getCustomerInfo();
  }

  async validateCPF(cpf) {
    await this.ensureInitialized();

    // Usar o validador do manager quando disponível
    if (!this.usesMockData && this.manager && typeof this.manager.validateCPF === 'function') {
      return this.manager.validateCPF(cpf);
    }

    // Validação simples local (fallback para mock)
    const digits = String(cpf).replace(/\D/g, '');
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let first = (sum * 10) % 11;
    if (first === 10 || first === 11) first = 0;
    if (first !== parseInt(digits[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    let second = (sum * 10) % 11;
    if (second === 10 || second === 11) second = 0;
    return second === parseInt(digits[10]);
  }

    

  async getTransactionHistory(limit = 10) {
    await this.ensureInitialized();

    if (this.usesMockData) {
      if (this.mock && typeof this.mock.getMockTransactionHistory === 'function') {
        return this.mock.getMockTransactionHistory(limit);
      }
      return [];
    }

    if (this.manager && typeof this.manager.getTransactionHistory === 'function') {
      return await this.manager.getTransactionHistory(limit);
    }

    return [];
  }

  isUsingMockData() {
    return this.usesMockData;
  }

  async getStatus() {
    await this.ensureInitialized();

    return {
      serverAvailable: this.isServerAvailable,
      usingMockData: this.usesMockData,
      message: this.usesMockData 
        ? 'Usando modo de teste com dados fictícios'
        : 'Sistema de pagamento conectado ao servidor'
    };
  }
}

// Instância global de integração
let paymentIntegration;

if (typeof window !== 'undefined') {
  // Aguardar que ambos payment-manager.js e payment-mock.js sejam carregados
  const initPaymentIntegration = () => {
    if (typeof paymentManager !== 'undefined' && typeof paymentMockService !== 'undefined') {
      paymentIntegration = new PaymentIntegration();
      console.log('✓ Payment Integration inicializada');
    } else {
      // Tentar novamente em 100ms
      setTimeout(initPaymentIntegration, 100);
    }
  };

  // Iniciar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPaymentIntegration);
  } else {
    setTimeout(initPaymentIntegration, 100);
  }
}
/**
 * payment-manager.js
 * Gerencia pagamentos via PIX, Boleto e Cartão (Mercado Pago)
 * Integra o payment-brazil.js com o frontend
 */

class PaymentManager {
  constructor() {
    this.apiBase = 'http://localhost:5000/api/payment';
    this.token = localStorage.getItem('nutriScanToken');
    this.user = null;
  }

  // ── PIX ──────────────────────────────────────────────────
  async generatePIX(amount, description = '') {
    try {
      const customerInfo = await this.getCustomerInfo();
      if (!customerInfo) throw new Error('Dados do cliente não encontrados');

      const response = await fetch(`${this.apiBase}/pix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          amount,
          description: description || 'Assinatura Premium Safe-Bite',
          customerInfo
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao gerar PIX');
      }

      // Garantir que exista um QR Code para exibição no cliente.
      try {
        const payment = data.payment || {};

        if (!payment.qrCode && payment.pixCode) {
          // Tentar gerar via qrCodeGenerator se disponível
          if (typeof qrCodeGenerator !== 'undefined') {
            try {
              await qrCodeGenerator.loadLibrary();
              if (qrCodeGenerator.isLibraryLoaded()) {
                payment.qrCode = await qrCodeGenerator.generatePixQRCode(payment.pixCode);
              } else {
                // fallback para API externa
                const encoded = encodeURIComponent(payment.pixCode);
                payment.qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}&color=2ecc71&bgcolor=ffffff`;
              }
            } catch (e) {
              const encoded = encodeURIComponent(payment.pixCode);
              payment.qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}&color=2ecc71&bgcolor=ffffff`;
            }
          } else {
            const encoded = encodeURIComponent(payment.pixCode);
            payment.qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}&color=2ecc71&bgcolor=ffffff`;
          }
        }

        return payment;
      } catch (err) {
        console.warn('Erro ao garantir QR Code localmente:', err);
        return data.payment;
      }
    } catch (error) {
      console.error('[PIX] Erro:', error);
      throw error;
    }
  }

  // ── BOLETO ───────────────────────────────────────────────
  async generateBoleto(amount, address = '') {
    try {
      const customerInfo = await this.getCustomerInfo();
      if (!customerInfo) throw new Error('Dados do cliente não encontrados');

      if (!address) {
        throw new Error('Endereço é obrigatório para boleto');
      }

      customerInfo.address = address;

      const response = await fetch(`${this.apiBase}/boleto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          amount,
          customerInfo
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao gerar boleto');
      }

      return data.payment;
    } catch (error) {
      console.error('[BOLETO] Erro:', error);
      throw error;
    }
  }

  // ── CARTÃO ───────────────────────────────────────────────
  async processCardPayment(token, amount, installments = 1) {
    try {
      const customerInfo = await this.getCustomerInfo();
      if (!customerInfo) throw new Error('Dados do cliente não encontrados');

      const response = await fetch(`${this.apiBase}/card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          token,
          amount,
          installments,
          email: customerInfo.email,
          cpf: customerInfo.cpf,
          name: customerInfo.name
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao processar cartão');
      }

      return data.payment;
    } catch (error) {
      console.error('[CARD] Erro:', error);
      throw error;
    }
  }

  // ── VERIFICAR STATUS ─────────────────────────────────────
  async getPaymentStatus(paymentId) {
    try {
      const response = await fetch(`${this.apiBase}/${paymentId}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao verificar status');
      }

      return data.payment;
    } catch (error) {
      console.error('[STATUS] Erro:', error);
      throw error;
    }
  }

  // ── OBTER MÉTODOS DISPONÍVEIS ────────────────────────────
  async getPaymentMethods() {
    try {
      const response = await fetch(`${this.apiBase}/methods`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao obter métodos de pagamento');
      }

      return data.methods;
    } catch (error) {
      console.error('[METHODS] Erro:', error);
      // Retornar métodos fictícios como fallback
      return this.getMockPaymentMethods();
    }
  }

  // ── VALIDAR CPF ──────────────────────────────────────────
  validateCPF(cpf) {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let first = (sum * 10) % 11;
    if (first === 10 || first === 11) first = 0;
    if (first !== parseInt(digits[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    let second = (sum * 10) % 11;
    if (second === 10 || second === 11) second = 0;
    return second === parseInt(digits[10]);
  }

  // ── OBTER INFORMAÇÕES DO CLIENTE ─────────────────────────
  async getCustomerInfo() {
    try {
      if (!this.user) {
        const response = await fetch('http://localhost:5000/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });

        if (!response.ok) {
          throw new Error('Usuário não autenticado');
        }

        const data = await response.json();
        this.user = data.user;
      }

      return {
        name: this.user.name || 'Cliente',
        email: this.user.email || '',
        cpf: this.user.cpf || localStorage.getItem('userCpf') || ''
      };
    } catch (error) {
      console.error('[CUSTOMER INFO] Erro:', error);
      return null;
    }
  }

  // ── MOCK: Métodos de pagamento fictícios ──────────────────
  getMockPaymentMethods() {
    return [
      { id: 'pix', name: 'PIX', processingTime: 'Instantâneo' },
      { id: 'boleto', name: 'Boleto', processingTime: '1–3 dias úteis' },
      { id: 'card', name: 'Cartão', processingTime: 'Instantâneo' }
    ];
  }


  // ── MOCK: Boleto fictício ────────────────────────────────
  getMockBoletoResponse(amount) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    return {
      id: `boleto_${Date.now()}`,
      status: 'pending',
      amount: amount,
      barcodeNumber: '12345.67890 12345.678901 12345.678901 1 12345678901234',
      digitableLine: '12345.67890 12345.678901 12345.678901 1 12345678901234',
      boletoUrl: 'https://example.com/boleto',
      dueDate: dueDate.toISOString(),
      beneficiary: { name: 'Safe-Bite Ltda' },
      instructions: [
        'Pague em qualquer banco, lotérica ou app de pagamento.',
        'Não pague após o vencimento sem verificar a correção monetária.',
        'O boleto pode levar até 3 dias úteis para compensar.'
      ]
    };
  }

  // ── MOCK: Cartão fictício ────────────────────────────────
  getMockCardResponse() {
    return {
      id: `card_${Date.now()}`,
      status: 'approved',
      statusDetail: 'Pagamento aprovado com sucesso'
    };
  }
}

// Instância global
let paymentManager;
if (typeof window !== 'undefined') {
  paymentManager = new PaymentManager();
}
/**
 * qr-code-generator.js
 * Gerador de QR Code funciona offline via QRCode.js
 * CDN: https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
 */

class QRCodeGenerator {
  constructor() {
    this.qrCodeLibLoaded = typeof QRCode !== 'undefined';
  }

  /**
   * Gera QR Code em formato canvas/imagem
   * @param {string} text - Texto/código a ser convertido em QR
   * @param {object} options - Opções de configuração
   * @returns {Promise<string>} Data URL da imagem PNG
   */
  async generateQRCode(text, options = {}) {
    const config = {
      width: options.width || 256,
      height: options.height || 256,
      colorDark: options.colorDark || '#000000',
      colorLight: options.colorLight || '#FFFFFF',
      correctLevel: options.correctLevel || 'M',
      ...options
    };

    return new Promise((resolve, reject) => {
      try {
        // Criar container temporário
        const container = document.createElement('div');
        container.style.display = 'none';
        document.body.appendChild(container);

        // Gerar QR Code
        const qr = new QRCode(container, {
          text: text,
          width: config.width,
          height: config.height,
          colorDark: config.colorDark,
          colorLight: config.colorLight,
          correctLevel: QRCode.CorrectLevel[config.correctLevel]
        });

        // Aguardar renderização
        setTimeout(() => {
          try {
            const canvas = container.querySelector('canvas');
            if (canvas) {
              const dataUrl = canvas.toDataURL('image/png');
              document.body.removeChild(container);
              resolve(dataUrl);
            } else {
              throw new Error('Canvas não encontrado');
            }
          } catch (error) {
            document.body.removeChild(container);
            reject(error);
          }
        }, 100);
      } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
        reject(error);
      }
    });
  }

  /**
   * Gera QR Code para PIX (com logo)
   * @param {string} pixCode - Código PIX para escanear
   * @returns {Promise<string>} Data URL da imagem PNG
   */
  async generatePixQRCode(pixCode) {
    return this.generateQRCode(pixCode, {
      width: 300,
      height: 300,
      colorDark: '#2ecc71', // Verde Safe-Bite
      colorLight: '#ffffff',
      correctLevel: 'H' // Alta correção de erro
    });
  }

  /**
   * Fallback: Gera QR Code alternativo usando canvas manual
   * Para usar se biblioteca não carregar
   */
  async generateQRCodeManual(text) {
    return this.generateSimpleQRViaSVG(text);
  }

  /**
   * Gera QR Code via SVG (mais simples, sem biblioteca)
   * Fallback para quando QRCode.js não estiver disponível
   */
  async generateSimpleQRViaSVG(text) {
    try {
      // Usar API externa como fallback (funciona offline com cache)
      const encodedText = encodeURIComponent(text);
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedText}&color=2ecc71&bgcolor=ffffff`;
      
      return qrImageUrl;
    } catch (error) {
      console.error('Erro ao gerar QR Code manual:', error);
      throw error;
    }
  }

  /**
   * Valida se biblioteca QRCode está disponível
   */
  isLibraryLoaded() {
    return this.qrCodeLibLoaded;
  }

  /**
   * Carrega biblioteca se não estiver
   */
  async loadLibrary() {
    if (this.qrCodeLibLoaded) {
      return true;
    }

    return new Promise((resolve) => {
      if (typeof QRCode !== 'undefined') {
        this.qrCodeLibLoaded = true;
        resolve(true);
        return;
      }

      // Criar script dinamicamente
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      
      script.onload = () => {
        this.qrCodeLibLoaded = typeof QRCode !== 'undefined';
        console.log('✓ QRCode.js carregado');
        resolve(true);
      };

      script.onerror = () => {
        console.warn('⚠ Não foi possível carregar QRCode.js via CDN');
        this.qrCodeLibLoaded = false;
        resolve(false);
      };

      document.head.appendChild(script);
    });
  }
}

// Instância global
let qrCodeGenerator;

if (typeof window !== 'undefined') {
  qrCodeGenerator = new QRCodeGenerator();
  
  // Carregar biblioteca ao iniciar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      qrCodeGenerator.loadLibrary().catch(e => console.warn('QR Code não disponível:', e));
    });
  } else {
    qrCodeGenerator.loadLibrary().catch(e => console.warn('QR Code não disponível:', e));
  }
}
/**
 * payment-mock.js
 * Script de testes com dados reais de teste do Mercado Pago
 * Use quando o servidor não está disponível
 */

class PaymentMockService {
  constructor() {
    this.transactions = [];
    this.mockUsers = {
      'TESTUSER2312961698484744720': {
        id: '3426677436',
        name: 'Comprador Teste',
        email: 'TESTUSER2312961698484744720@testuser.com',
        cpf: '123.456.789-09',
        subscription: 'free'
      }
    };
  }

  // ── Mock: Simular resposta dos métodos de pagamento ───────
  async getMockPaymentMethods() {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          methods: [
            { id: 'pix', name: 'PIX', processingTime: 'Instantâneo' },
            { id: 'boleto', name: 'Boleto', processingTime: '1–3 dias úteis' },
            { id: 'card', name: 'Cartão', processingTime: 'Instantâneo' }
          ]
        });
      }, 500);
    });
  }

  // ── Mock: Simular geração de PIX ─────────────────────────
  async generateMockPIX(amount, description) {
    const pixId = `pix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const pixCode = this.generatePixCode();
    
    // Usar image.png como QR Code estático
    const qrCode = 'qr-code-pix.png';
    
    const pixData = {
      success: true,
      payment: {
        id: pixId,
        status: 'pending',
        amount: parseFloat(amount),
        qrCode: qrCode,
        pixCode: pixCode,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        description: description || 'Assinatura Premium Safe-Bite',
        createdAt: new Date().toISOString()
      }
    };

    this.transactions.push(pixData.payment);

    return new Promise((resolve) => {
      setTimeout(() => resolve(pixData.payment), 1000);
    });
  }

  // ── Mock: Simular geração de Boleto ──────────────────────
  async generateMockBoleto(amount, customerInfo) {
    const boletoId = `boleto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const boletoData = {
      success: true,
      payment: {
        id: boletoId,
        status: 'pending',
        amount: parseFloat(amount),
        barcodeNumber: this.generateBarcodeNumber(),
        digitableLine: this.generateDigitableLine(),
        boletoUrl: `https://example.com/boleto/${boletoId}`,
        dueDate: dueDate.toISOString(),
        beneficiary: {
          name: 'Safe-Bite',
          cnpj: '12.345.678/0001-90',
          bank: 'Mercado Pago'
        },
        payer: customerInfo,
        instructions: [
          'Pague em qualquer banco, lotérica ou app de pagamento.',
          'Não pague após o vencimento sem verificar a correção monetária.',
          'O boleto pode levar até 3 dias úteis para compensar.',
          'Quaisquer dúvidas, entre em contato conosco.'
        ],
        createdAt: new Date().toISOString()
      }
    };

    this.transactions.push(boletoData.payment);

    return new Promise((resolve) => {
      setTimeout(() => resolve(boletoData.payment), 1500);
    });
  }

  // ── Mock: Simular processamento de Cartão ────────────────
  async processMockCardPayment(cardToken, amount, installments) {
    const cardId = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Simular aprovação / rejeição
    const isApproved = Math.random() > 0.1; // 90% de chance de aprovação

    const cardData = {
      success: isApproved,
      payment: {
        id: cardId,
        status: isApproved ? 'approved' : 'rejected',
        statusDetail: isApproved 
          ? 'Pagamento aprovado com sucesso! Processando assinatura...'
          : 'Cartão recusado. Verifique os dados e tente novamente.',
        amount: parseFloat(amount),
        installments: parseInt(installments) || 1,
        installmentAmount: (parseFloat(amount) / (parseInt(installments) || 1)).toFixed(2),
        lastFourDigits: cardToken.slice(-4),
        authorizationCode: this.generateAuthorizationCode(),
        createdAt: new Date().toISOString()
      }
    };

    this.transactions.push(cardData.payment);

    return new Promise((resolve) => {
      // Simular delay de processamento
      setTimeout(() => {
        resolve(cardData.payment);
      }, 2000);
    });
  }

  // ── Mock: Verificar status de pagamento ──────────────────
  async getMockPaymentStatus(paymentId) {
    const transaction = this.transactions.find(t => t.id === paymentId);

    if (!transaction) {
      return {
        success: false,
        message: 'Pagamento não encontrado',
        payment: {
          id: paymentId,
          status: 'not_found'
        }
      };
    }

    // Simular mudança de status ao longo do tempo
    let status = transaction.status;
    
    if (transaction.status === 'pending') {
      // Aleatoriamente marcar como pago após alguns segundos
      if (Math.random() > 0.5) {
        status = 'paid';
        transaction.status = 'paid';
        transaction.paidAt = new Date().toISOString();
      }
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          payment: {
            id: paymentId,
            status: status,
            statusDetail: this.getStatusDescription(status),
            amount: transaction.amount,
            method: transaction.id.split('_')[0],
            createdAt: transaction.createdAt,
            paidAt: transaction.paidAt || null
          }
        });
      }, 800);
    });
  }

  // ── Mock: Obter histórico de transações ───────────────────
  getMockTransactionHistory(limit = 10) {
    return this.transactions.slice(-limit).reverse().map(t => ({
      id: t.id,
      amount: t.amount,
      status: t.status,
      method: t.id.split('_')[0].toUpperCase(),
      createdAt: t.createdAt,
      description: t.description || 'Assinatura'
    }));
  }

  // ── Helpers ──────────────────────────────────────────────

  generateQRCodeBase64Fallback() {
    // Retorna um PNG simples em base64 (fallback)
    return 'https://media.discordapp.net/attachments/1393084275993346170/1510374121760886955/image.png?ex=6a1c9504&is=6a1b4384&hm=7f013aee65e8fbd9783a2737f4a4570cb3786c462c0df628630885f117a6a9db&=&format=webp&quality=lossless';
  }

  async generatePixQRCodeAlternative(pixCode) {
    // Gera QR Code via API externa (funciona offline com cache)
    try {
      const encodedCode = encodeURIComponent(pixCode);
      return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedCode}&color=2ecc71&bgcolor=ffffff`;
    } catch (error) {
      console.warn('Erro ao gerar QR Code alternativo:', error);
      return this.generateQRCodeBase64Fallback();
    }
  }

  generateQRCodeBase64() {
    // Retorna um PNG simples em base64 (placeholderImage)
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }

  generatePixCode() {
    // Gera código PIX real de teste do Mercado Pago
    // Formato: chave PIX + dados da transação
    const pixKey = 'myhpc3301@gmail.com';
    const transactionId = `MP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const amount = '0000000000990'; // R$ 9,90 em formato PIX
    
    // VALOR DO PIX
    return `00020126360014br.gov.bcb.pix0114+554499736812952040000530398654049.905802BR5924Bruno Perandre Nunes Dos6009Sao Paulo62240520daqr339692014808645263042248`;
  }

  generateQRCodeBase64Fallback() {
    // Usa a imagem image.png como QR Code do PIX
    return 'image.png';
  }

  generateBarcodeNumber() {
    // Formato: XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXX
    const numbers = Array(47).fill(0).map(() => Math.floor(Math.random() * 10)).join('');
    const formatted = [
      numbers.slice(0, 5),
      numbers.slice(5, 10),
      numbers.slice(10, 15),
      numbers.slice(15, 21),
      numbers.slice(21, 26),
      numbers.slice(26, 32),
      numbers.slice(32, 37),
      numbers.slice(37, 38),
      numbers.slice(38, 47)
    ].join('.');

    return formatted;
  }

  generateDigitableLine() {
    return this.generateBarcodeNumber(); // Mesmo formato neste mock
  }

  generateAuthorizationCode() {
    return 'AUTH' + Date.now().toString().slice(-6);
  }

  getStatusDescription(status) {
    const descriptions = {
      'approved': 'Pagamento aprovado com sucesso',
      'pending': 'Pagamento pendente de confirmação',
      'paid': 'Pagamento confirmado e processado',
      'rejected': 'Pagamento recusado',
      'cancelled': 'Pagamento cancelado',
      'expired': 'Pagamento expirou',
      'refunded': 'Pagamento reembolsado'
    };

    return descriptions[status] || 'Status desconhecido';
  }

  // ── Mock: Simular erro de conexão ────────────────────────
  async simulateServerError(errorType = 'ECONNREFUSED') {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const error = new Error(`Erro de conexão: ${errorType}`);
        error.code = errorType;
        reject(error);
      }, 500);
    });
  }

  // ── Mock: Simular webhook de pagamento ───────────────────
  async processWebhookMock(paymentId) {
    const transaction = this.transactions.find(t => t.id === paymentId);
    
    if (transaction) {
      transaction.status = 'paid';
      transaction.paidAt = new Date().toISOString();
      
      return {
        success: true,
        message: 'Webhook recebido e processado',
        payment: transaction
      };
    }

    return {
      success: false,
      message: 'Pagamento não encontrado para webhook'
    };
  }
}

// Instância global do serviço de mock
let paymentMockService;
if (typeof window !== 'undefined') {
  paymentMockService = new PaymentMockService();
}

  // Retornar informações de cliente mock (utilitário)
  PaymentMockService.prototype.getMockCustomerInfo = async function() {
    const keys = Object.keys(this.mockUsers || {});
    const u = this.mockUsers[keys[0]] || {};
    return {
      name: u.name || 'Comprador Teste',
      email: u.email || 'TESTUSER2312961698484744720@testuser.com',
      cpf: u.cpf || '123.456.789-09'
    };
  };

// Exemplo de uso:
/*
// Gerar PIX fictício
const pixPayment = await paymentMockService.generateMockPIX(9.90, 'Assinatura Premium');
console.log('PIX gerado:', pixPayment);

// Processar cartão fictício
const cardPayment = await paymentMockService.processMockCardPayment('4111111111111111', 9.90, 1);
console.log('Cartão processado:', cardPayment);

// Verificar status
const status = await paymentMockService.getMockPaymentStatus(pixPayment.id);
console.log('Status:', status);

// Histórico
console.log('Histórico:', paymentMockService.getMockTransactionHistory());
*/
/**
 * payment-test.js
 * Testes automatizados para o sistema de pagamento
 * Executar no console do navegador: loadScript('payment-test.js')
 */

class PaymentSystemTest {
  constructor() {
    this.testResults = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(message, type = 'info') {
    const prefix = {
      'pass': '✓',
      'fail': '✗',
      'info': 'ℹ',
      'warn': '⚠'
    };

    const color = {
      'pass': '#2ecc71',
      'fail': '#e74c3c',
      'info': '#3498db',
      'warn': '#f39c12'
    };

    const style = `color: ${color[type]}; font-weight: bold;`;
    console.log(`%c${prefix[type]} ${message}`, style);
  }

  async test(name, testFunc) {
    try {
      await testFunc();
      this.passed++;
      this.testResults.push({ name, status: 'PASS' });
      this.log(`PASS: ${name}`, 'pass');
    } catch (error) {
      this.failed++;
      this.testResults.push({ name, status: 'FAIL', error: error.message });
      this.log(`FAIL: ${name} - ${error.message}`, 'fail');
    }
  }

  assertEquals(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
    }
  }

  assertTrue(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  assertExists(obj, message) {
    if (!obj) {
      throw new Error(`${message}: objeto não existe`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runAllTests() {
    console.clear();
    this.log('=== INICIANDO TESTES DO SISTEMA DE PAGAMENTO ===', 'info');
    this.log('');

    // Testes de inicialização
    await this.test('Scripts carregados', async () => {
      this.assertExists(paymentManager, 'PaymentManager');
      this.assertExists(paymentMockService, 'PaymentMockService');
      this.assertExists(paymentIntegration, 'PaymentIntegration');
    });

    await this.test('PaymentIntegration inicializado', async () => {
      if (paymentIntegration.initPromise) {
        await paymentIntegration.ensureInitialized();
      }
      const status = await paymentIntegration.getStatus();
      this.assertExists(status, 'Status do sistema');
    });

    // Testes de métodos de pagamento
    await this.test('Obter métodos de pagamento', async () => {
      const methods = await paymentIntegration.getPaymentMethods();
      this.assertTrue(Array.isArray(methods), 'Deve retornar array');
      this.assertTrue(methods.length > 0, 'Deve ter pelo menos um método');
      this.log(`  Métodos disponíveis: ${methods.map(m => m.name).join(', ')}`, 'info');
    });

    // Testes PIX
    await this.test('Gerar PIX fictício', async () => {
      const pix = await paymentMockService.generateMockPIX(9.90, 'Teste');
      this.assertExists(pix.id, 'PIX deve ter ID');
      this.assertExists(pix.pixCode, 'PIX deve ter código');
      this.assertExists(pix.qrCode, 'PIX deve ter QR Code');
      this.assertEquals(pix.status, 'pending', 'Status inicial deve ser pending');
      this.log(`  PIX Code: ${pix.pixCode.substring(0, 20)}...`, 'info');
    });

    // Testes Boleto
    await this.test('Gerar Boleto fictício', async () => {
      const boleto = await paymentMockService.generateMockBoleto(9.90, {
        name: 'Teste User',
        email: 'test@example.com'
      });
      this.assertExists(boleto.id, 'Boleto deve ter ID');
      this.assertExists(boleto.barcodeNumber, 'Boleto deve ter número');
      this.assertEquals(boleto.status, 'pending', 'Status inicial deve ser pending');
      this.log(`  Barcode: ${boleto.barcodeNumber}`, 'info');
    });

    // Testes Cartão
    await this.test('Processar Cartão fictício (aprovado)', async () => {
      const card = await paymentMockService.processMockCardPayment('4111111111111111', 9.90, 1);
      this.assertExists(card.id, 'Cartão deve ter ID');
      this.assertTrue(
        ['approved', 'rejected'].includes(card.status),
        'Status deve ser approved ou rejected'
      );
      this.log(`  Status: ${card.status}`, 'info');
    });

    // Testes de validação CPF
    await this.test('Validação CPF - CPF válido', async () => {
      const isValid = paymentManager.validateCPF('111.444.777-35');
      this.assertTrue(isValid, 'CPF válido deve retornar true');
    });

    await this.test('Validação CPF - CPF inválido', async () => {
      const isValid = paymentManager.validateCPF('000.000.000-00');
      this.assertTrue(!isValid, 'CPF inválido deve retornar false');
    });

    // Testes de Status
    await this.test('Verificar status de pagamento', async () => {
      const pix = await paymentMockService.generateMockPIX(9.90);
      await this.sleep(500);
      const status = await paymentMockService.getMockPaymentStatus(pix.id);
      this.assertExists(status.id, 'Status deve ter ID');
      this.assertExists(status.status, 'Status deve ter valor');
    });

    // Testes de Histórico
    await this.test('Obter histórico de transações', async () => {
      // Gerar algumas transações
      await paymentMockService.generateMockPIX(9.90);
      await paymentMockService.generateMockBoleto(9.90, { name: 'Test', email: 'test@test.com' });
      
      const history = paymentMockService.getMockTransactionHistory(5);
      this.assertTrue(Array.isArray(history), 'Histórico deve ser array');
      this.assertTrue(history.length >= 2, 'Deve ter pelo menos 2 transações');
      this.log(`  Total de transações: ${history.length}`, 'info');
    });

    // Testes de Status do Sistema
    await this.test('Status do sistema de pagamento', async () => {
      const status = await paymentIntegration.getStatus();
      this.assertExists(status.serverAvailable, 'Deve ter serverAvailable');
      this.assertExists(status.usingMockData, 'Deve ter usingMockData');
      this.assertExists(status.message, 'Deve ter message');
      this.log(`  Status: ${status.message}`, 'info');
    });

    // Testes de Formatação
    await this.test('Formatação de valores', async () => {
      const formats = [
        { input: 9.9, display: '9.90' },
        { input: 100, display: '100.00' },
        { input: 0.01, display: '0.01' }
      ];

      formats.forEach(f => {
        const formatted = f.input.toFixed(2);
        this.assertEquals(formatted, f.display, `Formatação de ${f.input}`);
      });
    });

    // Testes de Geração de IDs
    await this.test('Geração de IDs únicos', async () => {
      const ids = new Set();
      for (let i = 0; i < 10; i++) {
        const pix = await paymentMockService.generateMockPIX(9.90);
        ids.add(pix.id);
      }
      this.assertEquals(ids.size, 10, 'Todos os IDs devem ser únicos');
    });

    // Relatório final
    console.log('');
    this.log('=== RESUMO DOS TESTES ===', 'info');
    this.log(`Total: ${this.passed + this.failed}`, 'info');
    this.log(`Aprovados: ${this.passed}`, 'pass');
    this.log(`Falhados: ${this.failed}`, this.failed > 0 ? 'fail' : 'pass');
    console.log('');

    if (this.failed === 0) {
      this.log('✓ TODOS OS TESTES PASSARAM!', 'pass');
    } else {
      this.log(`✗ ${this.failed} testes falharam`, 'fail');
    }

    console.log('');
    console.table(this.testResults);

    return {
      total: this.passed + this.failed,
      passed: this.passed,
      failed: this.failed,
      results: this.testResults
    };
  }
}

// Função global para execução
async function runPaymentTests() {
  const tester = new PaymentSystemTest();
  return await tester.runAllTests();
}

// Função para carregar e testar
async function testPaymentSystem() {
  return await runPaymentTests();
}

// Exemplo de uso no console
console.log('%cCOMARdo de teste: testPaymentSystem()', 'color: #3498db; font-weight: bold;');
// Correções para botões não funcionais do Nutri-Scan
// Versão corrigida e otimizada

// Função para scroll suave para seções
function scrollToSection(sectionId) {
  const section = document.querySelector(sectionId);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
    // Fechar menu mobile se estiver aberto
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu && navMenu.classList.contains('active')) {
      navMenu.classList.remove('active');
      const toggle = document.querySelector('.mobile-menu-toggle');
      if (toggle) {
        toggle.classList.remove('active');
      }
    }
  }
}

// Aguardar DOM carregar
document.addEventListener('DOMContentLoaded', function() {
  console.log('Script de correções carregado');
  
  // Botões de assinatura - usar popup de upgrade
  document.querySelectorAll('.plan-button, .btn-pricing, .btn-primary').forEach(button => {
    // Verificar se é botão de assinatura
    if (button.textContent.includes('Assinar') || 
        button.textContent.includes('Upgrade') || 
        button.textContent.includes('Premium')) {
      button.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Usar o popup de upgrade
        if (typeof showUpgradePopup === 'function') {
          showUpgradePopup();
        } else {
          // Fallback se o popup não estiver disponível
          console.log('Popup não disponível, redirecionando...');
          window.location.hash = 'payment';
        }
      });
    }
  });

  // Botão de upload/demo
  const uploadBtn = document.querySelector('.upload-btn, .btn-demo');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Simular upload e scan
      simulateUploadAndScan();
    });
  }

  // Formulário de contato
  const contactForm = document.querySelector('#contactForm, .contact-form form');
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Simular envio do formulário
      simulateContactForm(this);
    });
  }

  // Newsletter
  const newsletterForm = document.querySelector('.newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Simular inscrição
      simulateNewsletter(this);
    });
  }

  // ===== MENU MOBILE RESPONSIVO ===== 
  // Funciona em Desktop, Tablet e Mobile
  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const navMenu = document.querySelector('.nav-menu');
  
  if (mobileMenuToggle && navMenu) {
    // Toggle do menu ao clicar no hamburger
    mobileMenuToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      navMenu.classList.toggle('active');
      mobileMenuToggle.classList.toggle('active');
    });
    
    // Fechar menu ao clicar em um link
    const navLinks = navMenu.querySelectorAll('.nav-link, .nav-menu a');
    navLinks.forEach(link => {
      link.addEventListener('click', function() {
        navMenu.classList.remove('active');
        mobileMenuToggle.classList.remove('active');
      });
    });
    
    // Fechar menu ao clicar fora dele
    document.addEventListener('click', function(e) {
      if (!mobileMenuToggle.contains(e.target) && !navMenu.contains(e.target)) {
        if (navMenu.classList.contains('active')) {
          navMenu.classList.remove('active');
          mobileMenuToggle.classList.remove('active');
        }
      }
    });
    
    // Fechar menu ao redimensionar a janela para desktop
    window.addEventListener('resize', function() {
      if (window.innerWidth > 900) {
        // Se voltou ao tamanho desktop, fechar o menu mobile
        if (navMenu.classList.contains('active')) {
          navMenu.classList.remove('active');
          mobileMenuToggle.classList.remove('active');
        }
        // Mostrar menu normalmente em desktop
        navMenu.style.display = 'flex';
      } else {
        // Em tablet/mobile, deixar o CSS controlar
        navMenu.style.display = '';
      }
    });

    // Suporte a tecla ESC para fechar menu
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && navMenu.classList.contains('active')) {
        navMenu.classList.remove('active');
        mobileMenuToggle.classList.remove('active');
      }
    });
  }

  // Demo upload functionality
  const demoUpload = document.getElementById('demoUpload');
  if (demoUpload) {
    demoUpload.addEventListener('click', function() {
      simulateUploadAndScan();
    });
  }

// Validar arquivo de imagem
function validateImageFile(file) {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  const validation = {
    isValid: true,
    errors: []
  };
  
  // Verificar tamanho
  if (file.size > maxSize) {
    validation.isValid = false;
    validation.errors.push('O arquivo deve ter no máximo 10MB');
  }
  
  // Verificar tipo
  if (!allowedTypes.includes(file.type)) {
    validation.isValid = false;
    validation.errors.push('Formato não suportado. Use: JPG, PNG ou WebP');
  }
  
  // Verificar dimensões (se possível)
  if (file.type.startsWith('image/')) {
    const img = new Image();
    img.onload = function() {
      if (this.width < 200 || this.height < 200) {
        validation.isValid = false;
        validation.errors.push('A imagem deve ter pelo menos 200x200px');
      }
      if (this.width > 4000 || this.height > 4000) {
        validation.isValid = false;
        validation.errors.push('A imagem deve ter no máximo 4000x4000px');
      }
    };
    img.src = URL.createObjectURL(file);
  }
  
  return validation;
}

// Criar input de arquivo real para upload
function createImageUploadInput() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  
  input.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const validation = validateImageFile(file);
    
    if (!validation.isValid) {
      showNotification('Erro na validação da imagem:', 'error', {
        duration: 8000,
        actions: [
          {
            text: 'Verificar requisitos',
            icon: 'info-circle',
            onClick: 'showImageRequirements()'
          }
        ]
      });
      
      // Mostrar erros específicos
      validation.errors.forEach(error => {
        setTimeout(() => {
          showNotification(error, 'warning', { duration: 3000 });
        }, 500);
      });
      
      return;
    }
    
    // Se válido, processar imagem
    processImageFile(file);
  });
  
  return input;
}

// Processar arquivo de imagem
function processImageFile(file) {
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const imageData = e.target.result;
    
    // Mostrar preview da imagem
    showImagePreview(imageData, file.name);
    
    // Iniciar scan com a imagem real
    simulateUploadAndScan(imageData);
  };
  
  reader.onerror = function() {
    showNotification('Erro ao ler o arquivo de imagem', 'error');
  };
  
  reader.readAsDataURL(file);
}

// Mostrar preview da imagem
function showImagePreview(imageData, fileName) {
  const preview = document.createElement('div');
  preview.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: white;
    padding: 1rem;
    border-radius: 12px;
    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 1rem;
    animation: slideUp 0.3s ease;
  `;
  
  preview.innerHTML = `
    <img src="${imageData}" alt="${fileName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">
    <div>
      <div style="font-weight: 600; color: #2c3e50; margin-bottom: 0.25rem;">${fileName}</div>
      <div style="font-size: 0.85rem; color: #7f8c8d;">Imagem carregada com sucesso</div>
    </div>
    <button onclick="this.parentElement.remove()" style="background: none; border: none; color: #999; cursor: pointer; padding: 0.5rem;">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  document.body.appendChild(preview);
  
  // Auto remover após 5 segundos
  setTimeout(() => {
    if (preview.parentNode) {
      preview.style.animation = 'slideDown 0.3s ease forwards';
      setTimeout(() => preview.remove(), 300);
    }
  }, 5000);
}

// Mostrar requisitos de imagem
function showImageRequirements() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  modal.innerHTML = `
    <div style="background: white; padding: 2rem; border-radius: 15px; max-width: 500px; width: 90%;">
      <h3 style="margin: 0; color: #2c3e50; margin-bottom: 1.5rem;">
        <i class="fas fa-image" style="color: #3498db; margin-right: 0.5rem;"></i>
        Requisitos da Imagem
      </h3>
      
      <div class="requirements-list">
        <div class="requirement-item">
          <i class="fas fa-check-circle" style="color: #2ecc71;"></i>
          <span><strong>Formatos:</strong> JPG, PNG, WebP</span>
        </div>
        <div class="requirement-item">
          <i class="fas fa-check-circle" style="color: #2ecc71;"></i>
          <span><strong>Tamanho máximo:</strong> 10MB</span>
        </div>
        <div class="requirement-item">
          <i class="fas fa-check-circle" style="color: #2ecc71;"></i>
          <span><strong>Dimensões:</strong> Mínimo 200x200px, máximo 4000x4000px</span>
        </div>
        <div class="requirement-item">
          <i class="fas fa-info-circle" style="color: #3498db;"></i>
          <span><strong>Dica:</strong> Imagens nítidas e bem iluminadas funcionam melhor</span>
        </div>
      </div>
      
      <button onclick="this.closest('div').parentElement.remove()" style="margin-top: 1.5rem; padding: 0.8rem 2rem; background: #3498db; color: white; border: none; border-radius: 8px; cursor: pointer;">
        Entendido
      </button>
    </div>
  `;
  
  // Adicionar CSS para requisitos
  if (!document.querySelector('#requirementsStyles')) {
    const style = document.createElement('style');
    style.id = 'requirementsStyles';
    style.textContent = `
      .requirements-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      
      .requirement-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        background: #f8f9fa;
        border-radius: 8px;
        border-left: 3px solid #2ecc71;
      }
      
      @keyframes slideUp {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      
      @keyframes slideDown {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(100%);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(modal);
  
  // Fechar ao clicar fora
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

  // Navegação suave
  setupSmoothScrolling();
});

// Verificar se usuário está logado
function isUserLoggedIn() {
  const token = localStorage.getItem('nutriScanToken');
  const user = localStorage.getItem('nutriScanUser');
  return !!(token && user);
}

// Mostrar aviso de login necessário
function showLoginRequiredWarning() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="background: white; padding: 2rem; border-radius: 15px; max-width: 400px; width: 90%; text-align: center;">
      <div style="margin-bottom: 1.5rem;">
        <i class="fas fa-lock" style="font-size: 3rem; color: #3498db; margin-bottom: 1rem;"></i>
        <h3 style="margin: 0; color: var(--text-dark); margin-bottom: 1rem;">Login Necessário</h3>
        <p style="margin: 0; color: var(--text-light); line-height: 1.6;">
          Para realizar scans de produtos, você precisa estar logado. 
          Isso nos permite salvar seu histórico e fornecer uma experiência personalizada.
        </p>
      </div>
      
      <div style="display: flex; gap: 1rem; justify-content: center;">
        <button onclick="this.closest('div').parentElement.remove()" style="padding: 0.8rem 1.5rem; background: var(--medium-gray); color: var(--text-dark); border: none; border-radius: 8px; cursor: pointer;">
          Cancelar
        </button>
        <button onclick="window.location.hash='login'" style="padding: 0.8rem 1.5rem; background: var(--gradient-primary); color: white; border: none; border-radius: 8px; cursor: pointer;">
          Fazer Login
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Fechar modal ao clicar fora
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Mostrar loading avançado
function showAdvancedLoading() {
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'advancedLoading';
  loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    backdrop-filter: blur(5px);
  `;

  loadingOverlay.innerHTML = `
    <div style="text-align: center; color: white;">
      <div class="scan-loader" style="margin-bottom: 2rem;">
        <div class="scanner-ring"></div>
        <div class="scanner-dot"></div>
        <div class="scanner-wave"></div>
      </div>
      <h3 style="margin: 0; font-size: 1.5rem; margin-bottom: 0.5rem;">Analisando Imagem</h3>
      <div class="loading-steps">
        <div class="step active" data-step="1">
          <i class="fas fa-upload"></i>
          <span>Enviando imagem</span>
        </div>
        <div class="step" data-step="2">
          <i class="fas fa-brain"></i>
          <span>Processando com IA</span>
        </div>
        <div class="step" data-step="3">
          <i class="fas fa-search"></i>
          <span>Identificando ingredientes</span>
        </div>
        <div class="step" data-step="4">
          <i class="fas fa-check-circle"></i>
          <span>Análise concluída</span>
        </div>
      </div>
      <div class="progress-bar-container" style="width: 300px; margin: 1.5rem auto 0;">
        <div class="progress-bar" id="scanProgressBar" style="width: 0%;"></div>
      </div>
    </div>
  `;

  // Adicionar CSS para o loading
  const style = document.createElement('style');
  style.textContent = `
    .scan-loader {
      position: relative;
      width: 120px;
      height: 120px;
      margin: 0 auto;
    }
    
    .scanner-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 3px solid transparent;
      border-top: 3px solid #2ecc71;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    .scanner-dot {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 12px;
      height: 12px;
      background: #2ecc71;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: pulse 1s ease-in-out infinite;
    }
    
    .scanner-wave {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 2px solid #2ecc71;
      border-radius: 50%;
      animation: wave 2s ease-out infinite;
    }
    
    .loading-steps {
      display: flex;
      justify-content: space-between;
      width: 400px;
      margin: 0 auto;
    }
    
    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      opacity: 0.3;
      transition: all 0.3s ease;
    }
    
    .step.active {
      opacity: 1;
      transform: scale(1.1);
    }
    
    .step i {
      font-size: 1.5rem;
      color: #2ecc71;
    }
    
    .step span {
      font-size: 0.8rem;
      text-align: center;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    @keyframes pulse {
      0%, 100% { transform: translate(-50%, -50%) scale(1); }
      50% { transform: translate(-50%, -50%) scale(1.5); }
    }
    
    @keyframes wave {
      0% {
        transform: scale(0.8);
        opacity: 1;
      }
      100% {
        transform: scale(1.5);
        opacity: 0;
      }
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(loadingOverlay);
  
  return loadingOverlay;
}

// Atualizar progresso do loading
function updateLoadingProgress(step, progress) {
  const steps = document.querySelectorAll('.step');
  const progressBar = document.getElementById('scanProgressBar');
  
  // Atualizar steps
  steps.forEach((stepEl, index) => {
    if (index < step) {
      stepEl.classList.add('active');
    } else {
      stepEl.classList.remove('active');
    }
  });
  
  // Atualizar progress bar
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }
}

// Simular upload e scan
function simulateUploadAndScan() {
  // Verificar se usuário está logado
  if (!isUserLoggedIn()) {
    showLoginRequiredWarning();
    return;
  }

  const uploadBtn = document.querySelector('.upload-btn, .btn-demo');
  if (!uploadBtn) return;

  // Mostrar loading avançado
  const loadingOverlay = showAdvancedLoading();
  
  // Simular etapas do processo
  setTimeout(() => updateLoadingProgress(1, 25), 500);
  setTimeout(() => updateLoadingProgress(2, 50), 1500);
  setTimeout(() => updateLoadingProgress(3, 75), 2500);
  setTimeout(() => updateLoadingProgress(4, 100), 3500);
  
  // Simular delay total
  setTimeout(() => {
    // Remover loading
    loadingOverlay.remove();
    
    // Mostrar resultado
    showScanResult();
    
    // Mostrar feedback visual no botão
    const originalText = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="fas fa-check"></i> Scan Concluído!';
    uploadBtn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
    
    setTimeout(() => {
      uploadBtn.innerHTML = originalText;
      uploadBtn.style.background = '';
    }, 2000);
  }, 4000);
}

// Mostrar resultado do scan
function showScanResult(imageData = null) {
  const result = {
    productName: 'Produto Teste',
    ingredients: ['Trigo', 'Açúcar', 'Leite', 'Ovos'],
    allergens: ['Glúten', 'Lactose'],
    status: 'warning',
    message: 'Este produto contém alérgenos que podem afetar você.'
  };

  // Criar modal de resultado
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;

  modal.innerHTML = `
    <div style="background: white; padding: 2rem; border-radius: 15px; max-width: 500px; width: 90%;">
      <div style="text-align: center; margin-bottom: 1.5rem;">
        <div style="width: 60px; height: 60px; background: ${result.status === 'warning' ? '#f39c12' : '#27ae60'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
          <i class="fas fa-${result.status === 'warning' ? 'exclamation' : 'check'}" style="color: white; font-size: 1.5rem;"></i>
        </div>
        <h3 style="margin: 0; color: var(--text-dark);">${result.productName}</h3>
      </div>
      
      <div style="margin-bottom: 1.5rem;">
        <h4 style="color: var(--text-dark); margin-bottom: 0.5rem;">Ingredientes:</h4>
        <p style="color: var(--text-light);">${result.ingredients.join(', ')}</p>
      </div>
      
      <div style="margin-bottom: 1.5rem;">
        <h4 style="color: var(--text-dark); margin-bottom: 0.5rem;">⚠️ Alérgenos Detectados:</h4>
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
          ${result.allergens.map(allergen => `
            <span style="background: #e74c3c; color: white; padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.8rem;">
              ${allergen}
            </span>
          `).join('')}
        </div>
      </div>
      
      <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
        <p style="margin: 0; color: var(--text-light);">${result.message}</p>
      </div>
      <div style="display: flex; gap: 1rem; justify-content: center;">
        <button onclick="this.closest('div').parentElement.remove()" style="padding: 0.8rem 1.5rem; background: var(--medium-gray); color: var(--text-dark); border: none; border-radius: 8px; cursor: pointer;">
          Fechar
        </button>
        <button onclick="saveScanToDashboard('${result.productName}', '${result.status}', ${imageData ? `'${imageData}'` : 'null'}); this.closest('div').parentElement.remove();" style="padding: 0.8rem 1.5rem; background: var(--gradient-primary); color: white; border: none; border-radius: 8px; cursor: pointer;">
          Ver Detalhes
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Fechar modal ao clicar fora
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Simular formulário de contato
function simulateContactForm(form) {
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;

  // Mostrar loading
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
  submitBtn.disabled = true;

  // Simular envio
  setTimeout(() => {
    submitBtn.innerHTML = '<i class="fas fa-check"></i> Enviado!';
    
    // Mostrar mensagem de sucesso
    showNotification('Mensagem enviada com sucesso! Entraremos em contato em breve.', 'success');
    
    // Limpar formulário
    form.reset();
    
    // Restaurar botão
    setTimeout(() => {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }, 2000);
  }, 1500);
}

// Simular newsletter
function simulateNewsletter(form) {
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;

  // Mostrar loading
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Inscrevendo...';
  submitBtn.disabled = true;

  // Simular inscrição
  setTimeout(() => {
    submitBtn.innerHTML = '<i class="fas fa-check"></i> Inscrito!';
    
    // Mostrar mensagem de sucesso
    showNotification('Inscrição realizada com sucesso! Obrigado por se inscrever na nossa newsletter.', 'success');
    
    // Limpar formulário
    form.reset();
    
    // Restaurar botão
    setTimeout(() => {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }, 2000);
  }, 1000);
}

// Configurar navegação suave
function setupSmoothScrolling() {
  const links = document.querySelectorAll('a[href^="#"]');
  
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      
      const targetId = this.getAttribute('href').substring(1);
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

// Mostrar notificação avançada
function showNotification(message, type = 'info', options = {}) {
  const {
    duration = 5000,
    showProgress = true,
    actions = [],
    icon = null
  } = options;

  const notification = document.createElement('div');
  notification.className = `advanced-notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border-left: 4px solid ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : '#3498db'};
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    max-width: 400px;
    min-width: 300px;
    animation: notificationSlideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    backdrop-filter: blur(10px);
  `;

  const notificationContent = `
    <div class="notification-header">
      <div class="notification-icon">
        <i class="fas fa-${icon || (type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : type === 'warning' ? 'exclamation-circle' : 'info-circle')}"></i>
      </div>
      <button class="notification-close" onclick="this.closest('.advanced-notification').remove()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="notification-body">
      <div class="notification-message">${message}</div>
      ${actions.length > 0 ? `
        <div class="notification-actions">
          ${actions.map(action => `
            <button class="notification-action-btn" onclick="${action.onClick}">
              <i class="fas fa-${action.icon}"></i>
              ${action.text}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
    ${showProgress ? `
      <div class="notification-progress">
        <div class="progress-bar" style="animation: progressCountdown ${duration}ms linear forwards;"></div>
      </div>
    ` : ''}
  `;

  notification.innerHTML = notificationContent;

  // Adicionar CSS para notificações avançadas
  if (!document.querySelector('#notificationStyles')) {
    const style = document.createElement('style');
    style.id = 'notificationStyles';
    style.textContent = `
      .advanced-notification {
        border-radius: 12px;
        overflow: hidden;
      }
      
      .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
      }
      
      .notification-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : '#3498db'};
        font-size: 1.2rem;
      }
      
      .notification-close {
        background: none;
        border: none;
        color: #999;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s ease;
      }
      
      .notification-close:hover {
        background: rgba(0,0,0,0.1);
        color: #666;
      }
      
      .notification-message {
        color: #2c3e50;
        line-height: 1.5;
        margin-bottom: 0.5rem;
      }
      
      .notification-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      
      .notification-action-btn {
        padding: 0.4rem 0.8rem;
        border: 1px solid #e0e0e0;
        background: white;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        transition: all 0.2s ease;
        color: #666;
      }
      
      .notification-action-btn:hover {
        background: #f8f9fa;
        border-color: #2ecc71;
        color: #2ecc71;
      }
      
      .notification-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: rgba(0,0,0,0.1);
      }
      
      .notification-progress .progress-bar {
        height: 100%;
        background: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : '#3498db'};
        width: 100%;
      }
      
      @keyframes notificationSlideIn {
        0% {
          transform: translateX(100%) scale(0.8);
          opacity: 0;
        }
        100% {
          transform: translateX(0) scale(1);
          opacity: 1;
        }
      }
      
      @keyframes progressCountdown {
        0% { width: 100%; }
        100% { width: 0%; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(notification);

  // Auto remover após duração
  if (duration > 0) {
    setTimeout(() => {
      notification.style.animation = 'notificationSlideOut 0.3s ease forwards';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, duration);
  }

  return notification;
}

// Adicionar animações CSS se não existirem
if (!document.querySelector('#notificationAnimations')) {
  const style = document.createElement('style');
  style.id = 'notificationAnimations';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// Configurar navegação suave
function setupSmoothScrolling() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        
        // Fechar menu mobile se estiver aberto
        const navMenu = document.querySelector('.nav-menu');
        const mobileToggle = document.querySelector('.mobile-menu-toggle');
        if (navMenu && navMenu.classList.contains('active')) {
          navMenu.classList.remove('active');
          mobileToggle.classList.remove('active');
        }
      }
    });
  });
}

// Salvar scan no dashboard
function saveScanToDashboard(productName, status, imageData = null) {
  // Atualizar estatísticas em tempo real
  updateDashboardStats(status);
  
  // Verificar se a função global está disponível (se o dashboard foi carregado)
  if (typeof addScanToDashboard === 'function') {
    addScanToDashboard(productName, status, imageData);
    showNotification('Scan salvo no dashboard!', 'success');
  } else {
    // Salvar no localStorage para sincronização posterior
    const scans = JSON.parse(localStorage.getItem('pendingScans') || '[]');
    scans.push({
      productName,
      status,
      imageData,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('pendingScans', JSON.stringify(scans));
    showNotification('Scan salvo! Será sincronizado com o dashboard.', 'success');
  }
}

// Atualizar estatísticas do dashboard em tempo real
function updateDashboardStats(status) {
  // Obter estatísticas atuais
  let stats = JSON.parse(localStorage.getItem('dashboardStats') || '{}');
  
  // Inicializar estatísticas se não existirem
  if (!stats.totalScans) stats.totalScans = 0;
  if (!stats.safeProducts) stats.safeProducts = 0;
  if (!stats.warningsFound) stats.warningsFound = 0;
  if (!stats.planUsage) stats.planUsage = 0;
  if (!stats.planLimit) stats.planLimit = 10;
  
  // Atualizar contadores
  stats.totalScans++;
  stats.planUsage++;
  
  if (status === 'safe') {
    stats.safeProducts++;
  } else if (status === 'warning' || status === 'danger') {
    stats.warningsFound++;
  }
  
  // Salvar estatísticas atualizadas
  localStorage.setItem('dashboardStats', JSON.stringify(stats));
  
  // Se o dashboard estiver aberto, atualizar a interface
  if (typeof updateDashboardUI === 'function') {
    updateDashboardUI(stats);
  }
}

// Função para o botão "Começar grátis" do hero
function handleHeroStartFree() {
  // Verificar se usuário já está logado
  if (!isUserLoggedIn()) {
    showLoginRequiredWarning();
    return;
  }
  
  // Usuário logado, redirecionar para dashboard (SPA routing)
  window.location.hash = 'dashboard';
}

// Exportar funções para uso global
window.NutriScanCorrections = {
  simulateUploadAndScan,
  showScanResult,
  showNotification,
  setupSmoothScrolling
};

// Disponibilizar função globalmente
window.handleHeroStartFree = handleHeroStartFree;

   // SPA Routing System
    class Router {
      constructor() {
        this.routes = {
          '': 'home',
          'home': 'home',
          'dashboard': 'dashboard',
          'login': 'login',
          'signup': 'signup',
          'scanner': 'scanner',
          'payment': 'payment',
          'settings': 'settings',
          'profile': 'profile',
          'history': 'history',
          'help': 'help',
          'privacy': 'privacy',
          'plans': 'plans',
          'allergy-scanner': 'allergy-scanner',
          'payment-tester': 'payment-tester'
        };
        this.init();
      }

      init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
        
        // Intercept all link clicks
        document.addEventListener('click', (e) => {
          const link = e.target.closest('a');
          if (link && link.getAttribute('href')?.startsWith('#')) {
            e.preventDefault();
            const hash = link.getAttribute('href').substring(1);
            this.navigate(hash);
          }
        });
      }

      handleRoute() {
        const hash = window.location.hash.substring(1);
        const page = this.routes[hash] || 'home';
        this.showPage(page);
      }

      navigate(page) {
        window.location.hash = page;
      }

      showPage(pageId) {
        // Hide all pages
        document.querySelectorAll('.page-section').forEach(section => {
          section.classList.remove('active');
        });

        // Show target page
        const targetPage = document.getElementById(`page-${pageId}`);
        if (targetPage) {
          targetPage.classList.add('active');
          
          // Scroll to top
          window.scrollTo(0, 0);
        }

        // Update navigation active states
        document.querySelectorAll('.nav-link').forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${pageId}`) {
            link.classList.add('active');
          }
        });
      }
    }

    // Global navigation function
    function navigateTo(page) {
      window.location.hash = page;
    }

    // Initialize router
    const router = new Router();

    // Show loading page initially, then redirect to home
    setTimeout(() => {
      if (!window.location.hash) {
        navigateTo('home');
      }
    }, 1000);