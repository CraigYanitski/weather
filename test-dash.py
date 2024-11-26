from dash import Dash, dcc, html, Input, Output, callback
import dash_bootstrap_components as dbc
from dash_bootstrap_templates import load_figure_template
import numpy as np
import pandas as pd
import geopandas
from matplotlib import pyplot as plt
import folium
from folium.plugins import HeatMap, MarkerCluster
import xyzservices.providers as xyzp
import os
from flask import render_template_string
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime

api_url = "https://api.weather.gc.ca/"
climate_stations = "collections/climate-stations"

province = "ALBERTA"
maps = [m.strip("map-").strip(".html") for m in os.listdir("maps")]
maps.sort()

def update_graph():
    gdf: geopandas.GeoDataFrame = geopandas.read_file("data/cgn_ab_shp_eng.zip")
    fig: plt.Axes = gdf.explore("area", legend=False)
    return fig

def make_map(mmap, **kwargs):
    # m = folium.Map(**kwargs)
    tiles = xyzp.query_name(mmap).build_url(
        scale_factor="{r}", 
        accessToken="<Insert your access token here>", 
        apikey="bde6f23be5b84fab955793ff148dd110")
    m: folium.Map = folium.Map(
        location=(53.55, -113.49), 
        tiles=tiles, 
        attr=mmap, 
        zoom_start=12, 
        # width=800,
        # height=600,
    )
    add_stations(m)
    add_heatmap(m)
    return m

def add_stations(m: folium.Map) -> folium.Map:
    df = pd.read_csv("data/site_list_en.csv", sep=',', header=1)
    df.iloc[df.Latitude == ' ', 3] = pd.NaT
    df_red = df.dropna()
    longitude: pd.Series = df_red.Longitude.apply(lambda x: -float(x[:-1]))
    latitude: pd.Series = df_red.Latitude.apply(lambda x: float(x[:-1]))
    MarkerCluster(
        locations=list(zip(latitude, longitude)),
        popups=df_red["English Names"].to_list(),
        ).add_to(m)
    # for i in range(df.shape[0]):
    #     m.add
    return m

def add_heatmap(m):
    df: pd.DataFrame = pd.read_csv("data/site_list_en.csv", sep=',', header=1)
    df.iloc[df.Latitude == ' ', 3] = pd.NaT
    df_red: pd.DataFrame = df.dropna()
    longitude: pd.Series = df_red.Longitude.apply(lambda x: -float(x[:-1]))
    latitude: pd.Series = df_red.Latitude.apply(lambda x: float(x[:-1]))
    HeatMap(
        list(zip(latitude, longitude, np.ones_like(latitude)))).add_to(m)
    return m

external_stylesheets: list[str] = [dbc.themes.DARKLY, dbc.themes.CYBORG]
load_figure_template(["cyborg", "darkly"])
app: Dash = Dash(__name__, external_stylesheets=external_stylesheets)

app.layout = html.Div([
    html.H1("Test weather app"),
    html.Div([
        html.Div(style={"width": "5%", "display": "inline-block"}),
        html.Blockquote(
            html.P("placeholder for incoming figure", style={"color": "white", "textAlign": "center"}),
            style={"padding": "30px 30px", "backgroundColor": "#404040", "width": "90%", "display": "inline-block"}),
    ], style={"width": "100%", "paddingTop": "50px"}),
    # html.Div([
    #     dcc.Graph(figure=update_graph(), id="test-figure")
    # ], style={"width": "100%", "paddingTop": "50px"}),
    html.Div([
        html.Div(style={"width": "5%", "display": "inline-block"}),
        dcc.Dropdown(
            id="map-menu", 
            options=maps, 
            value="OpenStreetMap.DE", 
            style={"display": "inline-block", "width": "40%"}),
        html.Div(style={"width": "55%", "display": "inline-block"}),
        html.Div(style={"width": "5%", "display": "inline-block"}),
        html.Iframe(srcDoc=open("maps/map-Jawg.Matrix.html", 'r').read(), 
            id="interactive-map", 
            style={"width": "90%", "height": "500px"}),
    ], style={"width": "100%", "paddingTop": "50px"}),
], style={"padding": "10px 20px", "marginTop": "100px", "marginLeft": "100px", "marginRight": "100px"})

@callback(
    Output("interactive-map", "srcDoc"), 
    Input("map-menu", "value"), 
)
def components(mmap) -> str:
    """
        Extract map components and put those on a page.
    """
    # tiles = xyzp.query_name(mmap).build_url(
    #     scale_factor="{r}", 
    #     accessToken="<Insert your access token here>", 
    #     apikey="bde6f23be5b84fab955793ff148dd110")
    # m: folium.Map = folium.Map(
    #     location=(53.55, -113.49), 
    #     tiles=tiles, 
    #     attr=mmap, 
    #     zoom_start=12, 
    #     # width=800,
    #     # height=600,
    # )
    # mm: folium.Map = add_stations(m)
    # mm = add_heatmap(m)
    m = make_map(mmap)

    m.get_root().render()
    header = m.get_root().header.render()
    body_html = m.get_root().html.render()
    script = m.get_root().script.render()

    return render_template_string(
        """
            <!DOCTYPE html>
            <html>
                <head>
                    {{ header|safe }}
                </head>
                <body
                    {{ body_html|safe }}
                    <script>
                        {{ script|safe }}
                    </script>
                </body>
            </html>
        """,
        header=header,
        body_html=body_html,
        script=script,
    )

if __name__ == "__main__":
    host: str = "0.0.0.0"
    app.run_server(host=host, port=8050, debug=True, use_reloader=True)

