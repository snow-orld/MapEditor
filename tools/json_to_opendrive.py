'''
file: json_to_opendrive.py

convert saved road json file to opendrive xodr

author: Xueman Mou
date: 2019/05/06
version: 0.0.1
modified: 2019/05/08 12:53:00 GMT +0800

developing environment: python 3.7.2
dependencies: sys, os, json
'''
import sys
import os
import json

def ls(folder):
	files = []
	for dirpath, dirnames, filenames in os.walk(folder):
		for filename in filenames:
			if filename.endswith('_raw.json'):
				files.append(os.path.join(dirpath, filename))
	return files

def batch(path):
	files = ls(path)
	for file in files:
		convert(file)	

def convert(file):
	print('converting %s' % file)

	fp = open(file, 'r')
	obj = json.load(fp)
	fp.close()

	folder = os.path.dirname(os.path.abspath(file))
	filename = os.path.split(file)[-1]	# split a pathname, returns tuple (head, tail),where tail is everything after the final slash
	
	if not os.path.exists(folder):
		os.makedirs(folder)
	destfile = os.path.join(folder, os.path.splitext(filename)[0] + '.xodr')
	
	fp = open(destfile, 'w')

	fp.write('<?xml version="1.0" standalone="yes"?>\n')
	fp.write('<OpenDRIVE>\n')

	indent = 1

	'''################################################################################################
	 	put all segments in one road to avoid gemetry segment causing gaps in matlab scenario designer	
	'''################################################################################################
	road0 = obj[0]

	# caculate total road length after combining all roads into one road - useful for elevatio importation for Scenario Designer
	s = 0
	for road in obj:
		for geometry in road[u'geometries']:
			s += geometry[u'length']

	# road tag
	fp.write('\t'*indent)
	fp.write('<road length=\"%.16e\" id=\"%d\">\n' % (s, road0[u'id']))

	# planView tag
	indent += 1
	fp.write('\t'*indent)
	fp.write('<planView>\n')

	s = 0
	for road in obj:

		# geometry tag: put multiple road's geometries in one road in xodr
		indent += 1
		for geometry in road[u'geometries']:
			fp.write('\t'*indent)
			fp.write('<geometry s=\"%.16e\" x=\"%.16e\" y=\"%.16e\" hdg=\"%.16e\" length=\"%.16e\">\n' % (s, geometry[u'sx'], geometry[u'sy'], geometry[u'heading'], geometry[u'length']))
			
			# geometry type tag
			indent += 1
			if geometry[u'type'] == 'line':
				fp.write('\t'*indent)
				fp.write('<line/>\n')
			elif geometry[u'type'] == 'spiral':
				fp.write('\t'*indent)
				fp.write('<spiral curvStart=\"%.16e\" curvEnd=\"%.16e\"/>\n' % (geometry[u'spiral'][u'curvStart'], geometry[u'spiral'][u'curvEnd']))
			elif geometry[u'type'] == 'arc':
				fp.write('\t'*indent)
				fp.write('<arc curvature=\"%.16e\"/>\n' % geometry[u'arc'][u'curvature'])
			indent -= 1
			# end of geometry type tag

			fp.write('\t'*indent)
			fp.write('</geometry>\n')
			
			s += geometry[u'length']
		indent -= 1
		# end of geometry tag

	fp.write('\t'*indent)
	fp.write('</planView>\n')
	indent -= 1
	# end of planView tag

	# elevationProfile tag
	indent += 1
	fp.write('\t'*indent)
	fp.write('<elevationProfile>\n')

	indent += 1
	fp.write('\t'*indent)
	fp.write('<elevation s=\"%.16e\" a=\"%.16e\" b=\"%.16e\" c=\"%.16e\" d=\"%.16e\"/>\n' % (0, road0[u'elevations'][0][u'a'], road0[u'elevations'][0][u'b'], road0[u'elevations'][0][u'c'], road0[u'elevations'][0][u'd']))
	indent -= 1

	fp.write('\t'*indent)
	fp.write('</elevationProfile>\n')
	indent -= 1
	# end of elevationProfile tag

	# lanes tag
	indent += 1
	fp.write('\t'*indent)
	fp.write('<lanes>\n')

	# laneSection tag
	indent += 1
	fp.write('\t'*indent)
	fp.write('<laneSection s=\"%.16e\">\n' % (0))

	# sort out left center right lanes
	leftLanes = []
	centerLane = None
	rightLanes = []
	for lane in road0[u'laneSections'][0]:
		if lane[u'id'] > 0:
			leftLanes.append(lane)
		elif lane[u'id'] == 0:
			centerLane = lane
		else:
			rightLanes.append(lane)

	indent += 1
	if len(leftLanes) > 0:
		fp.write('\t'*indent)
		fp.write('<left>\n')

		for left in leftLanes:
			indent += 1
			fp.write('\t'*indent)
			fp.write('<lane id=\"%d\" type=\"%s\" level=\"%d\">\n' % (left[u'id'], 'driving', 0))

			# width and road mark
			indent += 1
			
			fp.write('\t'*indent)
			fp.write('<width sOffset=\"%.16e\" a=\"%.16e\" b=\"%.16e\" c=\"%.16e\" d=\"%.16e\"/>\n' % (left[u'width'][u's'], left[u'width'][u'a'], left[u'width'][u'b'], left[u'width'][u'c'], left[u'width'][u'd']))
			fp.write('\t'*indent)
			fp.write('<roadMark sOffset=\"%.16e\" type=\"%s\" weight=\"%s\" color=\"%s\" width=\"%.16e\"/>\n' % (0, left[u'roadMark'][u'type'], left[u'roadMark'][u'weight'], left[u'roadMark'][u'color'], left[u'roadMark'][u'width']))
			
			indent -= 1
			# end of width and road mark

			fp.write('\t'*indent)
			fp.write('</lane>\n')
			indent -= 1

		fp.write('\t'*indent)
		fp.write('</left>\n')

	fp.write('\t'*indent)
	fp.write('<center>\n')

	indent += 1
	fp.write('\t'*indent)
	fp.write('<lane id=\"%d\" type=\"%s\" level=\"%d\">\n' % (centerLane[u'id'], 'driving', 0))
	# roadMark
	indent += 1
	fp.write('\t'*indent)
	fp.write('<roadMark sOffset=\"%.16e\" type=\"%s\" weight=\"%s\" color=\"%s\" width=\"%.16e\"/>\n' % (0, centerLane[u'roadMark'][u'type'], centerLane[u'roadMark'][u'weight'], centerLane[u'roadMark'][u'color'], centerLane[u'roadMark'][u'width']))				
	indent -= 1
	# end of roadMark
	fp.write('\t'*indent)
	fp.write('</lane>\n')
	indent -= 1

	fp.write('\t'*indent)
	fp.write('</center>\n')

	if len(rightLanes) > 0:
		fp.write('\t'*indent)
		fp.write('<right>\n')

		for right in rightLanes:
			indent += 1
			fp.write('\t'*indent)
			fp.write('<lane id=\"%d\" type=\"%s\" level=\"%d\">\n' % (right[u'id'], 'driving', 0))

			# width and road mark
			indent += 1
			
			fp.write('\t'*indent)
			fp.write('<width sOffset=\"%.16e\" a=\"%.16e\" b=\"%.16e\" c=\"%.16e\" d=\"%.16e\"/>\n' % (right[u'width'][u's'], right[u'width'][u'a'], right[u'width'][u'b'], right[u'width'][u'c'], right[u'width'][u'd']))
			fp.write('\t'*indent)
			fp.write('<roadMark sOffset=\"%.16e\" type=\"%s\" weight=\"%s\" color=\"%s\" width=\"%.16e\"/>\n' % (0, right[u'roadMark'][u'type'], right[u'roadMark'][u'weight'], right[u'roadMark'][u'color'], right[u'roadMark'][u'width']))
			
			indent -= 1
			# end of width and road mark

			fp.write('\t'*indent)
			fp.write('</lane>\n')
			indent -= 1

		fp.write('\t'*indent)
		fp.write('</right>\n')

	indent -= 1
	# end of left center right lane

	fp.write('\t'*indent)
	fp.write('</laneSection>\n')
	indent -= 1
	# end of laneSection tag

	fp.write('\t'*indent)
	fp.write('</lanes>\n')
	indent -= 1
	# end of lanes tag

	fp.write('\t'*indent)
	fp.write('</road>\n')
	# end of road tag

	fp.write('</OpenDRIVE>\n')

	fp.close()

def main():

	if len(sys.argv) != 2:
		print('usage: %s <json file> or <folder name>'  % __file__)
		sys.exit()

	if os.path.isfile(sys.argv[1]):
		convert(sys.argv[1])
	else:
		batch(sys.argv[1])

if __name__ == '__main__':
	main()