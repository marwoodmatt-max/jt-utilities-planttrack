"use client";
import { ImageIcon, Truck, Wrench } from "lucide-react";

type Props = {
 url?:string|null;
 description:string;
 category?:string|null;
 assetCode?:string;
 large?:boolean;
};

export default function AssetPhoto({url,description,category,assetCode,large=false}:Props){
 const vehicle=/vehicle|hgv|trailer/i.test(category||"");
 const Icon=vehicle?Truck:/plant|agricultural/i.test(category||"")?Wrench:ImageIcon;
 return <div className={"asset-photo"+(large?" asset-photo-large":"")} aria-label={description||assetCode||"Asset image"}>
  {url?<img src={url} alt={description||assetCode||"Asset"} loading="lazy"/>:
   <div className="asset-photo-placeholder">
    <Icon size={large?34:23} aria-hidden="true"/>
    <span>{category||"JT Asset"}</span>
    <strong>{description||assetCode||"Asset photo"}</strong>
   </div>}
 </div>;
}
