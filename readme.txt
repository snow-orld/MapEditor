mapEditor使用方法

0 写在前面
---------
在生成多个弯道构成的道路时，为了Driving Scenario Disgner能够完全复现由mapEditor导出的OpenDRIVE数据：
0.1 必须由道路几何类型是“line”的道路段作为整体道路的起始和终止路段（关于“几何类型”请参考2.1）
0.2 在有曲率（半径的倒数）变化时（比如直道变弯道、弯道变直道、不同半径的弯道），必须使用几何类型为“spiral”的路段进行过度

1 打开地图编辑器
--------------
1.1 直接双击index.html文件，跳转到浏览器界面。默认初始坐标系为向右为X正半轴，向上为Y正半轴。
1.2 看到浏览器界面上有一段预先生成的长度为10m的默认直道，为当前可编辑道路。
1.3 按下鼠标右键在浏览器页面拖动，可以进行可视窗口的平移。按下鼠标左键在浏览器页面拖动，可以变换观察角度（创建道路时不建议变换角度）。滚动滑轮可以进行缩放。

2 编辑当前道路属性
---------------
2.1 Map Editor -> Detail -> Geometry
	编辑当前道路形状。
	
	修改道路几何类型type：在下拉菜单中的”line“直道、”spiral“羊角曲线(过度曲线)、”arc“圆弧曲线三种类型中选择。
	修改道路中心线的长度length：修改”length“旁边可编辑框里的数值。
	“curvStart”：仅当Geometry type选为“spiral”时有效。曲线起始点处对应的曲率值，即半径的倒数。
	“curvStart”：仅当Geometry type选为“spiral”时有效。曲线终止点处对应的曲率值，即半径的倒数。
	*Geometry type选为“spiral”时，曲线上的某点对应的曲率随该点到起点的曲线距离呈线性变化。
	“curvature”：仅当Geometry type选为“arc”时有效。圆弧曲线的曲率值，即对应的圆半径的倒数。
	
	注意：朝向道路前进方向，“curvStart”、“curvEnd”、“curvature”值为正时曲线左偏，值为负时曲线右偏。

	Map Editor -> Detail -> Geometry -> Lane Offset（一般用作整体横向偏移道路）
	道路中心线的偏移量。原始道路中心线上的点距离起点的纵向距离ds与道路中心线的横向偏移量的关系是offset = a + b * ds + c * ds^2 + d * ds^3。
	修改对应的“a”、“b”、“c”、“d”值可以定义道路中心线的偏移形状。如需使用，一般仅设定“a”值即可。
	
	注意：朝向道路前进方向，相对原始道路中心线，offset值为正时道路中心线偏向左侧，offset值为负时偏向右侧。 

2.2 Map Editor -> Detail -> Slope
	编辑当前道路坡度。

	当前道路起始点抬高的高度（仅在第一条道路时设定有效，用于下坡路段）：修改“initialHeight”可编辑框里的数值，单位m。
	当前道路坡度（仅在第一条道路设定，后续道路沿用同一坡度）：沿道路中心线，每前进1m，道路高度值的变化量。

2.3 Map Editor -> Detail -> Lanes
	编辑当前道路中的车道属性。

	车道的命名：车道在生成时被自动编号命名。命名规则是道路中心线是“Lane 0”，朝向道路前进方向，左侧车道名称为正值，右侧车道为负值，命名数字的绝对值从中间向两侧依次增加。

	修改车道宽度Width：与2.1中Lane Offset类似，ds和对应位置的车道宽度关系是width = a + b * ds + c * ds^2 + d * ds^3。
	修改对应的“a”、“b”、“c”、“d”值可以定义车道的宽度。一般仅改变“a”值即可。

	注意：道路中心线Lane 0仅有车道线属性，没有车道宽度属性。
	
	修改车道标线Roadmark：除了道路中心线Lane 0外，每条车道的车道标线指的是该条车道最外侧的车道线。
	修改Roadmark的类型type：在下拉菜单中选择“none“不绘制车道线、“broken”虚线、”solid“实线、“solid soild“双实线、”broken broken“双虚线、”solid broken“左实右虚线、”broken solid“左虚右实线。
	修改Roadmark的颜色color：在下拉菜单中选择“standard”白色、“white”白色、“yellow”黄色。
	修改Roadmark的宽度width：修改“width”旁边的可编辑框里的数值。

	添加车道：“addLeftLane”和“addRightLane”分别在最左侧和最右侧添加新的车道。新添加的车道的所有参数与它紧挨着的内侧车道参数一样。 
	移除最外侧车道：“removeLeftLane”和“removeRightLane”分别删除最左侧和最右侧车道。

	建议修改车道的操作顺序：
		1）点击“removeLeftLane”或“removeRightLane”将车道减至仅剩左侧和右侧各一条车道（如果为双向车道），设定好车道参数
		2）点击“addLeftLane”或“addRightLane”添加有同样参数的车道
		3）如果为单车道，可以设定Map Editor -> Detail -> Geometry -> Lane Offset的“a”值为半条车道宽度，这样可以把车道中心线的起点设置在（0，0）点
		4）修改最外侧车道的Roadmark的“type”为“solid”，确保最外侧车道标线为单实线；“color”可视情况定义
		5）视情况修改道路中心Lane 0车道线的属性

2.3 Map Editor -> addNewRoad
	添加新的道路段。新添加的道路段的所有参数与上一段路段完全相同。
	注意：添加新路段后，当前可编辑道路变为新添加的最末端道路，无法修改之前的道路。如果需要修改之前的道路只能通过undo当前道路，直到希望修改的道路段处于整体的最末端。

2.4 Map Editor -> undo
	删除当前道路段，可编辑道路设为上一段路段。

3 生成OpenDRIVE格式道路
---------------------
3.1 Map Exporter -> saveAsJSON
	导出时会自动下载两个json文件到本地“下载”文件夹：map.json和map_raw.json。
	map.json为对应的可视化工具使用的地图；map_raw.json用来生成OpenDRIVE格式的.xodr地图文件，用来导入到Driving Scenario Designer。

3.2 重命名map.json和map_raw.json为map_xxx.json和map_xxx_raw.json，xxx部分需要完全相同，并且用来生成.xodr的json文件命名必须以"_raw.json"结尾（在批处理生成OpenDRIVE文件时只识别以此命名方式的文件）。

3.3 使用python文件夹中的json_to_opendrive.py，将map_xxx_raw.json转换为OpenDRIVE的.xodr文件。在命令行中运行：
	> json_to_opendrive.py 路径/到/map_xxx_raw.json
	或者
	> json_to_opendrive.py 包含/map_xxx_raw.json的文件夹/路径
	前者转换单独的一个地图文件，后者批处理转换指定文件夹下的所有_raw.json文件。
	两种命令方式均在map_xxx_raw.json所在同一文件夹下生成map_xxx_raw.xodr文件，将该文件导入Driving Scenario Designer即可。

