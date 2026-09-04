/**
 * echarts 按需引入：只打包用到的图表与组件，大幅减小体积（全量 ~1.1MB → 核心 ~400KB）。
 * 使用方式与全量一致：`import * as echarts from '@/utils/echarts'`
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart, CandlestickChart, HeatmapChart, TreemapChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  TitleComponent,
  MarkLineComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  CandlestickChart,
  HeatmapChart,
  TreemapChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent,
  TitleComponent,
  MarkLineComponent,
  CanvasRenderer,
])

export * from 'echarts/core'
export default echarts
