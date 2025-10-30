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
        'BTC': 100,    // BTC合约面值100 USDT
        'ETH': 100,    // ETH合约面值100 USDT
        'BNB': 100,    // BNB合约面值100 USDT
        'XRP': 100,    // XRP合约面值100 USDT
        'ADA': 100,    // ADA合约面值100 USDT
        'DOGE': 100,   // DOGE合约面值100 USDT
        'SOL': 100,    // SOL合约面值100 USDT
        'AVAX': 100,   // AVAX合约面值100 USDT
        'MATIC': 100,  // MATIC合约面值100 USDT
        'DOT': 100,    // DOT合约面值100 USDT
        'LINK': 100,   // LINK合约面值100 USDT
        'UNI': 100,    // UNI合约面值100 USDT
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
    return this.config.contractSizes[symbol] || 100; // 默认100 USDT
  }

  /**
   * 设置合约面值
   */
  setContractSize(symbol: string, size: number): void {
    if (size <= 0) {
      throw new Error('Contract size must be positive');
    }
    this.config.contractSizes[symbol] = size;
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

    // Load contract sizes from environment variables
    // Format: BTC_CONTRACT_SIZE=100, ETH_CONTRACT_SIZE=100
    Object.keys(process.env).forEach(key => {
      if (key.endsWith('_CONTRACT_SIZE')) {
        const symbol = key.replace('_CONTRACT_SIZE', '');
        const size = parseFloat(process.env[key] || '');
        if (!isNaN(size) && size > 0) {
          this.config.contractSizes[symbol] = size;
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
      contractSizes: { ...this.config.contractSizes },
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

    if (config.contractSizes) {
      Object.entries(config.contractSizes).forEach(([symbol, size]) => {
        this.setContractSize(symbol, size);
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
        'BTC': 100,    // BTC合约面值100 USDT
        'ETH': 100,    // ETH合约面值100 USDT
        'BNB': 100,    // BNB合约面值100 USDT
        'XRP': 100,    // XRP合约面值100 USDT
        'ADA': 100,    // ADA合约面值100 USDT
        'DOGE': 100,   // DOGE合约面值100 USDT
        'SOL': 100,    // SOL合约面值100 USDT
        'AVAX': 100,   // AVAX合约面值100 USDT
        'MATIC': 100,  // MATIC合约面值100 USDT
        'DOT': 100,    // DOT合约面值100 USDT
        'LINK': 100,   // LINK合约面值100 USDT
        'UNI': 100,    // UNI合约面值100 USDT
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