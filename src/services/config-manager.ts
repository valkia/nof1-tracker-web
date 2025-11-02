export interface TradingConfig {
  defaultPriceTolerance: number;
  symbolTolerances: Record<string, number>;
  contractSizes: Record<string, number>; // 合约面值配置
  telegram: {
    enabled: boolean;
    token: string;
    chatId: string;
  }
}

export class ConfigManager {
  private config: TradingConfig;

  constructor() {
    this.config = {
      defaultPriceTolerance: 1.0, // Default 1.0%
      symbolTolerances: {},
      contractSizes: {
        'BTC': 100,
        'ETH': 100,
        'BNB': 100,
        'XRP': 100,
        'ADA': 100,
        'DOGE': 100,
        'SOL': 100,
        'AVAX': 100,
        'MATIC': 100,
        'DOT': 100,
        'LINK': 100,
        'UNI': 100,
      },
      telegram: {
        enabled: false,
        token: "",
        chatId: "",
      }
    };
  }

  /**
   * 获取价格容忍度
   */
  getPriceTolerance(symbol?: string): number {
    if (symbol && this.config.symbolTolerances[symbol]) {
      return this.config.symbolTolerances[symbol];
    }
    return this.config.defaultPriceTolerance;
  }

  /**
   * 获取合约面值
   */
  getContractSize(symbol: string): number {
    // 移除USDT后缀，如果有的话
    const baseSymbol = symbol.replace('USDT', '');
    return this.config.contractSizes[baseSymbol] || 100; // 默认100
  }

  /**
   * 设置默认价格容忍度
   */
  setPriceTolerance(tolerance: number): void {
    if (tolerance <= 0) {
      throw new Error('Price tolerance must be positive');
    }
    this.config.defaultPriceTolerance = tolerance;
  }

  /**
   * 设置特定币种的价格容忍度
   */
  setSymbolTolerance(symbol: string, tolerance: number): void {
    if (tolerance <= 0) {
      throw new Error('Price tolerance must be positive');
    }
    this.config.symbolTolerances[symbol] = tolerance;
  }

  setTelegramConfig(enabled: boolean, token: string, chatId: string): void {
    this.config.telegram = {
      enabled,
      token,
      chatId,
    };
  }

  /**
   * 从环境变量加载配置
   */
  loadFromEnvironment(): void {
    // Load default price tolerance
    const defaultTolerance = process.env.PRICE_TOLERANCE;
    if (defaultTolerance) {
      const tolerance = parseFloat(defaultTolerance);
      if (!isNaN(tolerance) && tolerance > 0) {
        this.config.defaultPriceTolerance = tolerance;
      }
    }

    // Load symbol-specific tolerances
    // Format: BTCUSDT_TOLERANCE=1.0, ETHUSDT_TOLERANCE=0.3
    Object.keys(process.env).forEach(key => {
      if (key.endsWith('_TOLERANCE')) {
        const symbol = key.replace('_TOLERANCE', '');
        const tolerance = parseFloat(process.env[key] || '');
        if (!isNaN(tolerance) && tolerance > 0) {
          this.config.symbolTolerances[symbol] = tolerance;
        }
      }
    });

    // Load Telegram configuration
    const telegramEnabled = process.env.TELEGRAM_ENABLED === 'true';
    const telegramToken = process.env.TELEGRAM_API_TOKEN || '';
    const telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
    if (telegramEnabled && telegramToken && telegramChatId) {
      this.setTelegramConfig(telegramEnabled, telegramToken, telegramChatId);
    }
  }

  /**
   * 导出配置
   */
  exportConfig(): TradingConfig {
    return {
      ...this.config,
      symbolTolerances: { ...this.config.symbolTolerances },
      telegram: { ...this.config.telegram }
    };
  }

  /**
   * 导入配置
   */
  importConfig(config: Partial<TradingConfig>): void {
    if (config.defaultPriceTolerance !== undefined) {
      this.setPriceTolerance(config.defaultPriceTolerance);
    }

    if (config.symbolTolerances) {
      Object.entries(config.symbolTolerances).forEach(([symbol, tolerance]) => {
        this.setSymbolTolerance(symbol, tolerance);
      });
    }

    if (config.telegram) {
      this.setTelegramConfig(config.telegram.enabled, config.telegram.token, config.telegram.chatId);
    }
  }

  /**
   * 重置配置为默认值
   */
  reset(): void {
    this.config = {
      defaultPriceTolerance: 1.0,
      symbolTolerances: {},
      contractSizes: {
        'BTC': 100,
        'ETH': 100,
        'BNB': 100,
        'XRP': 100,
        'ADA': 100,
        'DOGE': 100,
        'SOL': 100,
        'AVAX': 100,
        'MATIC': 100,
        'DOT': 100,
        'LINK': 100,
        'UNI': 100,
      },
      telegram: {
        enabled: false,
        token: "",
        chatId: "",
      }
    };
  }

  /**
   * 获取完整配置
   */
  getConfig(): TradingConfig {
    return this.exportConfig();
  }
}