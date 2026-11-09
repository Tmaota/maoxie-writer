// 这部分负责: 顶栏云端菜单 —— 复用 CloudPanel 的入口

import { Cloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CloudPanel, type CloudPanelProps } from './CloudPanel'

/** 顶栏的云端存储菜单：GitHub 登录 / 保存到云端 / 云端同步（内容复用 CloudPanel） */
export function CloudMenu(props: CloudPanelProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Cloud className="h-4 w-4" />
          {props.session && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="云端已连接" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-3">
        <CloudPanel {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
