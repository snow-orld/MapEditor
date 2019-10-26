# Interactive OpenDRIVE Map Generator for Matlab's Driving Scenario Designer

This web-based map editor along with a python converter tool is used for creating curved roads (spiral and arc) that can be imported into Matlab's Driving Scenario Tool. It provides a detailed parameter tuning interface allowing users to fine-tune lane-level attributes of a road.

The tool is developed mainly intended to parameter-defined curved road. Driving Scenario Tool allows users to create curved roads but only with spline points with unknown interpolating methods of the generated curved roads.

## Usage

### Map Creation and Editing

Open the index.html file and create your roads with specified attributes in a [OpenDRIVE V1.4 Format](http://www.opendrive.org/docs/OpenDRIVEFormatSpecRev1.4H.pdf) like style, under the "Map Editor" tab.

After creating the roads, click the "saveAsJSON" area under the "Map Exporter" tab. Two files are saved locally. Use the "map_raw.json" file for further convertion to a OpenDRIVE file that can be imported to Matlab's Driving Scenario Tool.

### Map Convertion

Under the ```tools``` folder, run the convertion tool as follows:
```
$ python json_to_opendrive.py dir/to/saved/map_raw.json
```

The converted OpenDRIVE file is automatically generated under the same folder as map_raw.json and with the same filename except with a '.xodr' extension. Then you can import the '.xodr' file into Matlab's Driving Scenario Designer tool.