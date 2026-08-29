import type { FundInfo } from '@/types/fund'

/**
 * 常见基金代码字典，用于"输入代码自动补全名称/类型"。
 * 当前环境后端接口拿不到基金名称，故内置一份常用代码表；
 * 未收录的代码仍可手动填写名称（保存在本地自选）。
 */
export const fundDict: Record<string, Pick<FundInfo, 'name' | 'type'>> = {
  '110022': { name: '易方达消费行业股票', type: '股票' },
  '005827': { name: '易方达蓝筹精选混合', type: '混合' },
  '270042': { name: '广发全球精选股票(QDII)', type: 'QDII' },
  '110011': { name: '易方达优质精选混合(QDII)', type: '混合' },
  '161725': { name: '招商中证白酒指数(LOF)', type: '指数' },
  '320007': { name: '诺安成长混合', type: '混合' },
  '519674': { name: '银河创新成长混合', type: '混合' },
  '161017': { name: '富国中证500指数增强', type: '指数' },
  '003096': { name: '中欧医疗健康混合A', type: '混合' },
}

export function lookupFundDict(code: string): Pick<FundInfo, 'name' | 'type'> | undefined {
  return fundDict[code]
}