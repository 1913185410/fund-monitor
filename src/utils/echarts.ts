/**
 * echarts 按需引入：只打包用到的图表与组件，大幅减小体积（全量 ~1.1MB → 核心 ~400KB）。
 * 使用方式与全量一致：`import * as echarts from '@/utils/echarts'`
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart, CandlestickChart, HeatmapChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  CandlestickChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  TitleComponent,
  CanvasRenderer,
])

export * from 'echarts/core'
export default echarts
